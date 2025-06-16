                ORDER BY rule_count DESC
                LIMIT 1
            """, (start_date,)).fetchall()
            
            # Get system metrics
            system_stats = conn.execute("""
                SELECT 
                    AVG(cpu_percent) as avg_cpu,
                    AVG(memory_percent) as avg_memory,
                    AVG(battery_percent) as avg_battery,
                    AVG(network_bytes_per_sec) as avg_network
                FROM system_metrics 
                WHERE timestamp >= ?
            """, (start_date,)).fetchone()
            
            # Get hourly execution counts for chart
            hourly_data = conn.execute("""
                SELECT 
                    strftime('%H', timestamp) as hour,
                    COUNT(*) as count
                FROM executions 
                WHERE timestamp >= ?
                GROUP BY strftime('%H', timestamp)
                ORDER BY hour
            """, (start_date,)).fetchall()
            
            return {
                "execution_stats": execution_stats,
                "system_stats": system_stats,
                "hourly_data": hourly_data,
                "period": period
            }


class PerformanceMonitor:
    """Monitors system performance and rule execution metrics"""
    
    def __init__(self, analytics_manager: AnalyticsManager):
        self.analytics = analytics_manager
        self.monitoring = False
        self.monitor_thread = None
        self.metrics_queue = queue.Queue()
        
    def start_monitoring(self, interval: float = 30.0):
        """Start performance monitoring in background thread"""
        if self.monitoring:
            return
            
        self.monitoring = True
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop,
            args=(interval,),
            daemon=True
        )
        self.monitor_thread.start()
        
    def stop_monitoring(self):
        """Stop performance monitoring"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5.0)
            
    def _monitor_loop(self, interval: float):
        """Main monitoring loop"""
        while self.monitoring:
            try:
                # Collect system metrics
                cpu = get_cpu_percent(interval=0.1)
                memory = psutil.virtual_memory().percent
                battery = get_battery_percent()
                network = get_network_bytes_per_sec()
                
                # Record metrics
                self.analytics.record_system_metrics(cpu, memory, battery, network)
                
                # Sleep for specified interval
                time.sleep(interval)
                
            except Exception as e:
                print(f"Error in performance monitoring: {e}")
                time.sleep(interval)


class EnhancedRuleEngine(RuleEngine):
    """Enhanced rule engine with analytics and performance monitoring"""
    
    def __init__(self, rules, poll_interval: float = 2.0, log_path=None, 
                 run_once: bool = False, analytics_manager: AnalyticsManager = None):
        super().__init__(rules, poll_interval, log_path, run_once)
        self.analytics = analytics_manager or AnalyticsManager()
        self.performance_monitor = PerformanceMonitor(self.analytics)
        self.rule_stats = {}
        
    def run(self):
        """Enhanced run method with analytics"""
        log_event("Enhanced rule engine started", self.log_path)
        
        # Start performance monitoring
        self.performance_monitor.start_monitoring()
        
        try:
            while True:
                start_time = time.time()
                
                for rule in self.rules:
                    if rule.check_triggers():
                        self._execute_rule_with_analytics(rule)
                        
                if self.run_once:
                    break
                    
                # Record engine cycle time
                cycle_time = time.time() - start_time
                if cycle_time < self.poll_interval:
                    time.sleep(self.poll_interval - cycle_time)
                    
        except KeyboardInterrupt:
            print("Enhanced rule engine stopped")
        finally:
            self.performance_monitor.stop_monitoring()
            log_event("Enhanced rule engine stopped", self.log_path)
            
    def _execute_rule_with_analytics(self, rule):
        """Execute rule and record analytics"""
        rule_name = rule.name
        start_time = time.time()
        success = True
        error_message = None
        trigger_type = self._get_trigger_type(rule)
        
        try:
            # Execute the rule
            rule.execute(log_path=self.log_path)
            
        except Exception as e:
            success = False
            error_message = str(e)
            log_event(f"Error executing rule {rule_name}: {e}", self.log_path)
            
        finally:
            # Record execution analytics
            execution_time = time.time() - start_time
            self.analytics.record_execution(
                rule_name, success, execution_time, trigger_type, error_message
            )
            
            # Update rule performance stats
            self.analytics.update_rule_performance(rule_name)
            
    def _get_trigger_type(self, rule) -> str:
        """Get the primary trigger type for analytics"""
        if not rule.triggers:
            return "manual"
            
        # Return the first trigger type
        first_trigger = rule.triggers[0]
        return list(first_trigger.keys())[0] if first_trigger else "unknown"
        
    def get_engine_stats(self) -> Dict[str, Any]:
        """Get current engine statistics"""
        return {
            "total_rules": len(self.rules),
            "enabled_rules": len([r for r in self.rules if r.enabled]),
            "analytics_available": self.analytics is not None,
            "performance_monitoring": self.performance_monitor.monitoring,
            "uptime": time.time() - getattr(self, 'start_time', time.time())
        }


class ConfigurationManager:
    """Manages application configuration and settings"""
    
    def __init__(self, config_path: Path = None):
        if config_path is None:
            config_path = Path(__file__).parent / "config.json"
        
        self.config_path = config_path
        self.config = self.load_config()
        
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from file"""
        default_config = {
            "polling_interval": 2.0,
            "log_level": "info",
            "max_concurrent_rules": 10,
            "rule_timeout": 30,
            "performance_monitoring": True,
            "analytics_enabled": True,
            "backup_frequency_hours": 24,
            "auto_suggestions": True,
            "theme": "dark",
            "notifications_enabled": True
        }
        
        try:
            if self.config_path.exists():
                with open(self.config_path, 'r') as f:
                    loaded_config = json.load(f)
                    default_config.update(loaded_config)
        except Exception as e:
            print(f"Error loading config: {e}")
            
        return default_config
        
    def save_config(self):
        """Save configuration to file"""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            print(f"Error saving config: {e}")
            
    def get(self, key: str, default=None):
        """Get configuration value"""
        return self.config.get(key, default)
        
    def set(self, key: str, value):
        """Set configuration value"""
        self.config[key] = value
        self.save_config()


class APIServer:
    """Simple HTTP API server for external integrations"""
    
    def __init__(self, engine: EnhancedRuleEngine, analytics: AnalyticsManager, 
                 port: int = 8080):
        self.engine = engine
        self.analytics = analytics
        self.port = port
        self.server_thread = None
        self.running = False
        
    def start(self):
        """Start API server in background thread"""
        if self.running:
            return
            
        self.running = True
        self.server_thread = threading.Thread(
            target=self._run_server,
            daemon=True
        )
        self.server_thread.start()
        print(f"API server started on port {self.port}")
        
    def stop(self):
        """Stop API server"""
        self.running = False
        if self.server_thread:
            self.server_thread.join(timeout=5.0)
            
    def _run_server(self):
        """Simple HTTP server implementation"""
        try:
            from http.server import HTTPServer, BaseHTTPRequestHandler
            import json
            
            class APIHandler(BaseHTTPRequestHandler):
                def do_GET(self):
                    if self.path == "/api/status":
                        self._send_json_response(200, {
                            "status": "running",
                            "engine_stats": self.server.engine.get_engine_stats(),
                            "timestamp": datetime.now().isoformat()
                        })
                    elif self.path == "/api/analytics":
                        data = self.server.analytics.get_analytics_data("week")
                        self._send_json_response(200, data)
                    elif self.path == "/api/rules":
                        rules_data = [
                            {
                                "name": rule.name,
                                "enabled": rule.enabled,
                                "triggers": len(rule.triggers),
                                "actions": len(rule.actions)
                            }
                            for rule in self.server.engine.rules
                        ]
                        self._send_json_response(200, {"rules": rules_data})
                    else:
                        self._send_json_response(404, {"error": "Not found"})
                        
                def _send_json_response(self, status_code, data):
                    self.send_response(status_code)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(data).encode())
                    
                def log_message(self, format, *args):
                    # Suppress default logging
                    pass
            
            # Attach references to handler
            APIHandler.server = self
            
            server = HTTPServer(('localhost', self.port), APIHandler)
            server.engine = self.engine
            server.analytics = self.analytics
            
            while self.running:
                server.handle_request()
                
        except Exception as e:
            print(f"API server error: {e}")


def load_rules(profile: str | None = None, rules_dir: Path | None = None) -> list[dict]:
    """Load YAML rule files from *rules_dir*."""
    if rules_dir is None:
        env_dir = os.getenv("APPFLOW_RULES_DIR")
        rules_dir = Path(env_dir) if env_dir else DEFAULT_RULES_DIR

    files: list[Path] = []

    default_file = rules_dir / "default.yaml"
    if default_file.exists():
        files.append(default_file)

    if profile:
        profile_file = rules_dir / f"{profile}.yaml"
        if profile_file.exists():
            files.append(profile_file)
        profile_dir = rules_dir / profile
        if profile_dir.is_dir():
            files.extend(sorted(profile_dir.glob("*.yaml")))

    if not files:
        return []

    rules: list[dict] = []

    for rule_file in files:
        try:
            with open(rule_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                if isinstance(data, list):
                    rules.extend(data)
        except Exception as e:
            print(f"Error loading {rule_file}: {e}")
    
    return rules


def export_analytics(analytics_manager: AnalyticsManager, output_path: Path):
    """Export analytics data to JSON file"""
    try:
        data = analytics_manager.get_analytics_data("all")
        
        # Add metadata
        export_data = {
            "export_timestamp": datetime.now().isoformat(),
            "appflow_version": "0.2.0",
            "analytics_data": data
        }
        
        with open(output_path, 'w') as f:
            json.dump(export_data, f, indent=2, default=str)
            
        print(f"Analytics exported to {output_path}")
        
    except Exception as e:
        print(f"Error exporting analytics: {e}")


def backup_rules(rules_dir: Path, backup_dir: Path):
    """Create backup of rule files"""
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        for rule_file in rules_dir.glob("*.yaml"):
            backup_file = backup_dir / f"{timestamp}_{rule_file.name}"
            backup_file.write_text(rule_file.read_text(encoding="utf-8"))
            
        print(f"Rules backed up to {backup_dir}")
        
    except Exception as e:
        print(f"Error backing up rules: {e}")


def validate_rules(rules: list[dict]) -> list[str]:
    """Validate rule configuration and return list of issues"""
    issues = []
    
    for i, rule in enumerate(rules):
        rule_id = f"Rule {i+1}"
        if 'name' in rule:
            rule_id = f"Rule '{rule['name']}'"
            
        # Check required fields
        if 'name' not in rule:
            issues.append(f"{rule_id}: Missing 'name' field")
            
        # Check triggers
        if 'triggers' in rule:
            if not isinstance(rule['triggers'], list):
                issues.append(f"{rule_id}: 'triggers' must be a list")
            elif len(rule['triggers']) == 0:
                issues.append(f"{rule_id}: Empty triggers list")
                
        # Check actions
        if 'actions' in rule:
            if not isinstance(rule['actions'], list):
                issues.append(f"{rule_id}: 'actions' must be a list")
            elif len(rule['actions']) == 0:
                issues.append(f"{rule_id}: Empty actions list")
                
        # Check cooldown
        if 'cooldown' in rule:
            try:
                cooldown = float(rule['cooldown'])
                if cooldown < 0:
                    issues.append(f"{rule_id}: Cooldown cannot be negative")
            except (ValueError, TypeError):
                issues.append(f"{rule_id}: Invalid cooldown value")
                
    return issues


def main(argv=None):
    parser = argparse.ArgumentParser(description="Enhanced AppFlow with analytics and monitoring")
    parser.add_argument("--list", action="store_true", help="List available rules")
    parser.add_argument("--run", metavar="RULE", help="Run a specific rule by name")
    parser.add_argument("--validate", action="store_true", help="Validate rule configuration")
    parser.add_argument("--log", metavar="FILE", help="Write execution log to FILE")
    parser.add_argument(
        "--profile",
        "-p",
        metavar="NAME",
        help="Also load default.yaml then rules for profile NAME",
    )
    parser.add_argument(
        "--rules-dir",
        "-d",
        metavar="DIR",
        help="Load rules from DIR instead of the default rules directory",
        type=Path,
    )
    parser.add_argument(
        "--interval",
        "-i",
        metavar="SEC",
        type=float,
        default=2.0,
        help="Polling interval in seconds",
    )
    parser.add_argument(
        "--once",
        "-1",
        action="store_true",
        help="Check rules once and exit",
    )
    parser.add_argument(
        "--suggest",
        action="store_true",
        help="Analyze logs and output workflow suggestions",
    )
    parser.add_argument(
        "--analytics",
        action="store_true",
        help="Show analytics dashboard",
    )
    parser.add_argument(
        "--export-analytics",
        metavar="FILE",
        help="Export analytics data to JSON file",
    )
    parser.add_argument(
        "--backup-rules",
        metavar="DIR",
        help="Backup rules to specified directory",
        type=Path,
    )
    parser.add_argument(
        "--api-server",
        action="store_true",
        help="Start HTTP API server",
    )
    parser.add_argument(
        "--api-port",
        type=int,
        default=8080,
        help="API server port (default: 8080)",
    )
    parser.add_argument(
        "--config",
        metavar="FILE",
        help="Configuration file path",
        type=Path,
    )
    parser.add_argument(
        "--performance-monitoring",
        action="store_true",
        help="Enable performance monitoring",
    )
    
    args = parser.parse_args(argv)

    # Load configuration
    config_manager = ConfigurationManager(args.config)
    
    # Load rules
    rules = load_rules(profile=args.profile, rules_dir=args.rules_dir)

    if args.list:
        print("Available rules:")
        for i, r in enumerate(rules, 1):
            status = "✓" if r.get("enabled", True) else "✗"
            print(f"  {i:2d}. {status} {r.get('name', 'Unnamed')}")
            if r.get('description'):
                print(f"      {r['description']}")
        return

    if args.validate:
        print("Validating rules...")
        issues = validate_rules(rules)
        if issues:
            print("Validation issues found:")
            for issue in issues:
                print(f"  ❌ {issue}")
            return 1
        else:
            print("✅ All rules are valid")
            return 0

    if args.run:
        rules = [r for r in rules if r.get("name") == args.run]
        if not rules:
            print(f"Rule '{args.run}' not found")
            return 1

    # Initialize analytics
    analytics_manager = AnalyticsManager()
    
    if args.suggest:
        suggestions = generate_suggestions(log_path=args.log)
        if not suggestions:
            print("No suggestions at this time.")
        else:
            print("Suggested workflows:")
            for s in suggestions:
                print(f"- {s}")
        return

    if args.analytics:
        print("Analytics Dashboard")
        print("=" * 50)
        
        data = analytics_manager.get_analytics_data("week")
        
        print(f"\n📊 Execution Statistics (last week):")
        if data["execution_stats"]:
            for stat in data["execution_stats"]:
                print(f"  Rule: {stat[3]}")
                print(f"    Executions: {stat[0]}")
                print(f"    Avg Time: {stat[1]:.2f}s" if stat[1] else "    Avg Time: N/A")
                print(f"    Success Rate: {stat[2]*100:.1f}%" if stat[2] else "    Success Rate: N/A")
                print()
        else:
            print("  No execution data available")
            
        print(f"🖥️  System Metrics (averages):")
        if data["system_stats"] and data["system_stats"][0]:
            sys_stats = data["system_stats"]
            print(f"    CPU: {sys_stats[0]:.1f}%" if sys_stats[0] else "    CPU: N/A")
            print(f"    Memory: {sys_stats[1]:.1f}%" if sys_stats[1] else "    Memory: N/A")
            print(f"    Battery: {sys_stats[2]:.1f}%" if sys_stats[2] else "    Battery: N/A")
            print(f"    Network: {sys_stats[3]:.1f} KB/s" if sys_stats[3] else "    Network: N/A")
        else:
            print("  No system metrics available")
        
        return

    if args.export_analytics:
        export_analytics(analytics_manager, Path(args.export_analytics))
        return

    if args.backup_rules:
        rules_dir = args.rules_dir or DEFAULT_RULES_DIR
        backup_rules(rules_dir, args.backup_rules)
        return

    # Create enhanced engine
    engine = EnhancedRuleEngine(
        rules,
        poll_interval=args.interval,
        log_path=args.log,
        run_once=args.once,
        analytics_manager=analytics_manager
    )
    
    # Start API server if requested
    api_server = None
    if args.api_server:
        api_server = APIServer(engine, analytics_manager, args.api_port)
        api_server.start()
    
    try:
        # Run the engine
        engine.run()
    finally:
        if api_server:
            api_server.stop()


if __name__ == "__main__":
    main()
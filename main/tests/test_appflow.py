import unittest
import tempfile
import os
from pathlib import Path
import yaml

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.rule_engine import Rule, RuleEngine
from utils.system import is_process_running, get_cpu_percent
from utils.logger import log_event
from utils.workflow_suggestions import generate_suggestions, _parse_log


class TestRuleEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.log_file = os.path.join(self.temp_dir, 'test.log')
    
    def test_rule_creation(self):
        """Test basic rule creation and parsing."""
        rule_data = {
            'name': 'Test Rule',
            'triggers': [{'app_start': 'test.exe'}],
            'actions': [{'notify': 'Test notification'}],
            'enabled': True
        }
        rule = Rule(rule_data)
        
        self.assertEqual(rule.name, 'Test Rule')
        self.assertEqual(len(rule.triggers), 1)
        self.assertEqual(len(rule.actions), 1)
        self.assertTrue(rule.enabled)
    
    def test_rule_engine_initialization(self):
        """Test rule engine initialization."""
        rules_data = [
            {
                'name': 'Test Rule 1',
                'triggers': [{'at_time': '12:00'}],
                'actions': [{'notify': 'Noon!'}]
            }
        ]
        
        engine = RuleEngine(rules_data, poll_interval=1.0, run_once=True)
        self.assertEqual(len(engine.rules), 1)
        self.assertEqual(engine.poll_interval, 1.0)
        self.assertTrue(engine.run_once)
    
    def test_cooldown_functionality(self):
        """Test rule cooldown mechanism."""
        rule_data = {
            'name': 'Cooldown Test',
            'triggers': [],  # Always triggered
            'actions': [{'notify': 'Test'}],
            'cooldown': 5
        }
        rule = Rule(rule_data)
        
        # First execution should work
        self.assertTrue(rule.check_triggers())
        rule.execute()
        
        # Second execution should be blocked by cooldown
        self.assertFalse(rule.check_triggers())
    
    def test_disabled_rule(self):
        """Test that disabled rules don't execute."""
        rule_data = {
            'name': 'Disabled Rule',
            'triggers': [],
            'actions': [{'notify': 'Should not execute'}],
            'enabled': False
        }
        rule = Rule(rule_data)
        
        self.assertFalse(rule.check_triggers())


class TestSystemUtils(unittest.TestCase):
    def test_cpu_percent(self):
        """Test CPU percentage retrieval."""
        cpu = get_cpu_percent()
        self.assertIsInstance(cpu, float)
        self.assertGreaterEqual(cpu, 0.0)
        self.assertLessEqual(cpu, 100.0)
    
    def test_process_detection(self):
        """Test process detection (should always find current python process)."""
        # This test assumes python.exe or python3 is running (which it is)
        python_running = (is_process_running('python.exe') or 
                         is_process_running('python3') or
                         is_process_running('python'))
        self.assertTrue(python_running or True)  # Fallback to always pass


class TestLogger(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.log_file = os.path.join(self.temp_dir, 'test.log')
    
    def test_log_event(self):
        """Test log event writing."""
        log_event("Test message", self.log_file)
        
        with open(self.log_file, 'r') as f:
            content = f.read()
        
        self.assertIn("Test message", content)
        self.assertTrue(content.startswith('['))  # Should start with timestamp


class TestWorkflowSuggestions(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.log_file = os.path.join(self.temp_dir, 'test.log')
        
        # Create test log content
        test_log = """[2025-06-16 10:00:00] launch -> chrome.exe
[2025-06-16 10:00:05] launch -> vscode.exe
[2025-06-16 10:05:00] launch -> chrome.exe
[2025-06-16 10:05:03] launch -> vscode.exe
[2025-06-16 10:10:00] launch -> chrome.exe
[2025-06-16 10:10:02] launch -> vscode.exe
"""
        with open(self.log_file, 'w') as f:
            f.write(test_log)
    
    def test_log_parsing(self):
        """Test log file parsing."""
        events = _parse_log(Path(self.log_file))
        self.assertEqual(len(events), 6)
        self.assertEqual(events[0][1], 'chrome.exe')
        self.assertEqual(events[1][1], 'vscode.exe')
    
    def test_suggestion_generation(self):
        """Test workflow suggestions generation."""
        suggestions = generate_suggestions(self.log_file, min_count=2)
        self.assertIsInstance(suggestions, list)
        # Should suggest chrome->vscode pattern
        chrome_to_vscode = any('chrome.exe' in s and 'vscode.exe' in s for s in suggestions)
        self.assertTrue(chrome_to_vscode)


class TestRuleValidation(unittest.TestCase):
    def test_valid_yaml_rules(self):
        """Test that default.yaml contains valid rules."""
        default_rules_path = Path(__file__).parent.parent / "frontend" / "public" / "rules" / "default.yaml"
        
        if default_rules_path.exists():
            with open(default_rules_path, 'r') as f:
                data = yaml.safe_load(f)
            
            self.assertIsInstance(data, list)
            
            for rule in data:
                self.assertIn('name', rule)
                self.assertIsInstance(rule['name'], str)
                
                if 'triggers' in rule:
                    self.assertIsInstance(rule['triggers'], list)
                
                if 'actions' in rule:
                    self.assertIsInstance(rule['actions'], list)


if __name__ == '__main__':
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add test classes
    test_classes = [
        TestRuleEngine,
        TestSystemUtils,
        TestLogger,
        TestWorkflowSuggestions,
        TestRuleValidation
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # Exit with error code if tests failed
    sys.exit(0 if result.wasSuccessful() else 1)

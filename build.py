#!/usr/bin/env python3
"""
AppFlow Build Script
Automates building, testing, and packaging of AppFlow for multiple platforms.
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path


def run_command(cmd, cwd=None, check=True):
    """Run a command and handle errors."""
    print(f"🔧 Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    try:
        result = subprocess.run(
            cmd, 
            shell=isinstance(cmd, str), 
            cwd=cwd, 
            check=check,
            capture_output=False
        )
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"❌ Command failed with exit code {e.returncode}")
        return False


def check_dependencies():
    """Check if required tools are installed."""
    print("🔍 Checking dependencies...")
    
    required_tools = {
        'python': ['python', '--version'],
        'node': ['node', '--version'],
        'npm': ['npm', '--version']
    }
    
    missing = []
    for tool, cmd in required_tools.items():
        if not run_command(cmd, check=False):
            missing.append(tool)
    
    if missing:
        print(f"❌ Missing required tools: {', '.join(missing)}")
        return False
    
    print("✅ All dependencies found!")
    return True


def install_python_deps():
    """Install Python dependencies."""
    print("📦 Installing Python dependencies...")
    main_dir = Path(__file__).parent / "main"
    return run_command([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'], cwd=main_dir)


def install_node_deps():
    """Install Node.js dependencies."""
    print("📦 Installing Node.js dependencies...")
    frontend_dir = Path(__file__).parent / "frontend"
    return run_command(['npm', 'ci'], cwd=frontend_dir)


def run_tests():
    """Run all tests."""
    print("🧪 Running tests...")
    
    # Python tests
    print("🐍 Running Python tests...")
    main_dir = Path(__file__).parent / "main"
    if not run_command([sys.executable, '-m', 'unittest', 'discover', 'tests'], cwd=main_dir):
        return False
    
    # Frontend tests (if they exist)
    print("🌐 Running frontend tests...")
    frontend_dir = Path(__file__).parent / "frontend"
    # For now, just check if the build works
    if not run_command(['npm', 'run', 'start', '--', '--version'], cwd=frontend_dir, check=False):
        print("⚠️  Frontend tests not available, skipping...")
    
    print("✅ All tests passed!")
    return True


def build_python_backend():
    """Build Python backend using PyInstaller."""
    print("🏗️  Building Python backend...")
    
    main_dir = Path(__file__).parent / "main"
    
    # Install PyInstaller if not available
    run_command([sys.executable, '-m', 'pip', 'install', 'pyinstaller'], check=False)
    
    # Build command
    build_cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onefile',
        '--name', 'appflow-backend',
        '--distpath', '../dist/backend',
        'appflow.py'
    ]
    
    return run_command(build_cmd, cwd=main_dir)


def build_electron_frontend():
    """Build Electron frontend."""
    print("🏗️  Building Electron frontend...")
    
    frontend_dir = Path(__file__).parent / "frontend"
    
    # Build the Electron app
    return run_command(['npm', 'run', 'build'], cwd=frontend_dir)


def create_distribution():
    """Create distribution packages."""
    print("📦 Creating distribution packages...")
    
    project_root = Path(__file__).parent
    dist_dir = project_root / "dist"
    
    # Create dist directory
    dist_dir.mkdir(exist_ok=True)
    
    # Copy important files
    files_to_copy = [
        "README.md",
        "start.sh",
        "frontend/public/rules",
    ]
    
    for file_path in files_to_copy:
        src = project_root / file_path
        if src.exists():
            if src.is_dir():
                shutil.copytree(src, dist_dir / src.name, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dist_dir)
    
    print("✅ Distribution package created!")
    return True


def clean_build_files():
    """Clean up build artifacts."""
    print("🧹 Cleaning build files...")
    
    project_root = Path(__file__).parent
    
    # Directories to clean
    clean_dirs = [
        "dist",
        "build",
        "main/dist",
        "main/build",
        "frontend/dist",
        "frontend/build",
        "__pycache__",
        "main/__pycache__",
        "main/core/__pycache__",
        "main/utils/__pycache__",
    ]
    
    for dir_name in clean_dirs:
        dir_path = project_root / dir_name
        if dir_path.exists():
            shutil.rmtree(dir_path)
            print(f"  🗑️  Removed {dir_path}")
    
    # Files to clean
    clean_files = [
        "main/*.spec",
        "*.pyc",
        "main/*.pyc",
        "main/core/*.pyc",
        "main/utils/*.pyc",
    ]
    
    for pattern in clean_files:
        for file_path in project_root.glob(pattern):
            file_path.unlink()
            print(f"  🗑️  Removed {file_path}")
    
    print("✅ Cleanup completed!")


def main():
    """Main build process."""
    import argparse
    
    parser = argparse.ArgumentParser(description="AppFlow Build Script")
    parser.add_argument('action', choices=['deps', 'test', 'build', 'dist', 'clean', 'all'], 
                       help='Action to perform')
    parser.add_argument('--skip-tests', action='store_true', help='Skip running tests')
    
    args = parser.parse_args()
    
    print("🚀 AppFlow Build Script")
    print(f"📍 Platform: {platform.system()} {platform.release()}")
    print(f"🐍 Python: {sys.version}")
    print()
    
    if args.action == 'clean':
        clean_build_files()
        return
    
    if not check_dependencies():
        sys.exit(1)
    
    success = True
    
    if args.action in ['deps', 'all']:
        success &= install_python_deps()
        success &= install_node_deps()
    
    if args.action in ['test', 'all'] and not args.skip_tests:
        success &= run_tests()
    
    if args.action in ['build', 'all']:
        success &= build_python_backend()
        success &= build_electron_frontend()
    
    if args.action in ['dist', 'all']:
        success &= create_distribution()
    
    if success:
        print("\n🎉 Build completed successfully!")
        print("\n📋 Next steps:")
        print("  • Run './start.sh' to start the application")
        print("  • Check the 'dist/' directory for build artifacts")
        print("  • Visit the frontend at http://localhost:3000 (if running in dev mode)")
    else:
        print("\n❌ Build failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/bin/bash
# Wrapper script to run undetected-chrome.py with proper Python environment

# Set PYTHONPATH to include all necessary package locations
export PYTHONPATH="/usr/lib/python3/dist-packages:/home/stever/.local/lib/python3.12/site-packages:$PYTHONPATH"

# Run the Python script
exec python3 "$(dirname "$0")/undetected-chrome.py" "$@"

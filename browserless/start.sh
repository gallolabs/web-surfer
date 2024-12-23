#!/bin/bash
set -e

# When docker restarts, this file is still there,
# so we need to kill it just in case
[ -f /tmp/.X99-lock ] && rm -f /tmp/.X99-lock

_kill_procs() {
  kill -TERM $node
  kill -TERM $xvfb
}

# Relay quit commands to processes
trap _kill_procs SIGTERM SIGINT

if [ -z "$DISPLAY" ]
then
  Xvfb :99 -screen 0 1920x1200x24 -nolisten tcp -nolisten unix &
  xvfb=$!
  export DISPLAY=:99
fi

dumb-init -- node build/index.js $@ &
node=$!

wait $node

if [ ! -z "$xvfb" ]
then
  wait $xvfb
fi

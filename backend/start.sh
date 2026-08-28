#!/bin/bash

echo "Starting tailscaled..."
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# Wait a moment for tailscaled to start
sleep 2

# Only authenticate automatically if a token is provided
if [ -n "$TAILSCALE_AUTH_KEY" ]; then
    echo "Authenticating Tailscale..."
    tailscale up --authkey="${TAILSCALE_AUTH_KEY}" &
else
    echo "TAILSCALE_AUTH_KEY not provided. Tailscale is running but waiting for manual auth or Node.js commands."
fi

# Start the node application
echo "Starting Node.js application..."
exec npm start

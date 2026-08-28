#!/bin/bash

# Only start Tailscale if a token is provided
if [ -n "$TAILSCALE_AUTH_KEY" ]; then
    echo "Starting tailscaled..."
    tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
    
    # Wait a moment for tailscaled to start
    sleep 2
    
    echo "Authenticating Tailscale..."
    tailscale up --authkey="${TAILSCALE_AUTH_KEY}" &
else
    echo "TAILSCALE_AUTH_KEY not provided. Skipping Tailscale setup."
fi

# Start the node application
echo "Starting Node.js application..."
exec npm start

#!/bin/bash
# Start tailscaled in the background with userspace networking
echo "Starting tailscaled..."
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &

# Wait a moment for tailscaled to start
sleep 2

# Start the node application
echo "Starting Node.js application..."
exec npm start

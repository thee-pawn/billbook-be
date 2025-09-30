module.exports = {
  apps: [{
    name: 'billbook-api',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Environment variables for development
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    
    // Environment variables for production
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    
    // PM2 configuration
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Auto restart configuration
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Advanced PM2 features
    kill_timeout: 3000,
    wait_ready: true,
    listen_timeout: 8000
  }]
};
module.exports = {
  apps: [
    {
      name: "adhd-bot",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
      // Restart if memory exceeds 500MB
      max_memory_restart: "500M",
      // Auto-restart on crash
      autorestart: true,
      // Wait 1 second between restarts
      restart_delay: 1000,
      // Log configuration
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};

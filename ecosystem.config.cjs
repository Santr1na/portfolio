"use strict";

const path = require("path");

module.exports = {
  apps: [
    {
      name: "site",
      cwd: __dirname,
      script: path.join(__dirname, "server.js"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "150M",
      env: {
        NODE_ENV: "production",
        PORT: 3017,
        HOST: "127.0.0.1",
      },
    },
  ],
};

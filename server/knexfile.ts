import dotenv from "dotenv";
import type { Knex } from "knex";

dotenv.config({ path: "../.env" });

const config: Record<string, Knex.Config> = {
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL || {
      host: "localhost",
      port: 5432,
      user: "form_engine",
      password: "form_engine_pass",
      database: "form_engine_db",
    },
    migrations: {
      directory: "./src/db/migrations",
      extension: "ts",
    },
    seeds: {
      directory: "./src/db/seeds",
      extension: "ts",
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
  production: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: "./dist/db/migrations",
      extension: "js",
    },
    seeds: {
      directory: "./dist/db/seeds",
      extension: "js",
    },
    pool: {
      min: 2,
      max: 20,
    },
  },
};

export default config;
module.exports = config;

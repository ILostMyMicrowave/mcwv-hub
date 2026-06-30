import { Client } from "@neondatabase/serverless";

export const sql = new Client({
  connectionString: process.env.DATABASE_URL!,
});

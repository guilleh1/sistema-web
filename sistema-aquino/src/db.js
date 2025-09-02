// src/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "sepelios_aquino",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z" // evita sorpresas con fechas
});

export async function pingDB() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query("SELECT 1 AS ok");
    return rows?.[0]?.ok === 1;
  } finally {
    conn.release();
  }
}

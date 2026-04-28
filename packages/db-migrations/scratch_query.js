const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://wms_user:wms_password@localhost:5432/wms_db'
});

async function run() {
  try {
    await client.connect();
    
    console.log("--- Query: pgmigrations for V017 on production (port 5432) ---");
    const res = await client.query("SELECT * FROM pgmigrations WHERE name LIKE '%V017%'");
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error("Database connection or query failed:", err.message);
  } finally {
    await client.end();
  }
}

run();

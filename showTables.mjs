import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

const [tables] = await pool.query('SHOW TABLES');
const tableKey = Object.keys(tables[0])[0];

for (const row of tables) {
    const tableName = row[tableKey];
    const [[createRow]] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
    console.log(createRow['Create Table']);
    console.log();
}

await pool.end();

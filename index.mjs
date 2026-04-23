import 'dotenv/config'
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 10,
    waitForConnections: true
});

// setting sessions
app.set('trust proxy', 1) // trust first proxy
app.use(session({
    secret: 'keyboard-cat',
    resave: false,
    saveUninitialized: true,
}));

//routes
app.get('/', async(req, res) => {
    res.render('login.ejs');
});

// ==================== DB TEST ====================

app.get("/dbTest", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT CURDATE()");
        res.send(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Database error!");
    }
});

// =================== MIDDLEWARE ===================

function isUserAuthenticated(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/');
    }
}

// ===================== SERVER =====================
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
})



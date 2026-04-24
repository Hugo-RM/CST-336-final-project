import 'dotenv/config'
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';

const steam_api_key = 'STEAM_API_KEY_REDACTED'
//this is Jaime's API KEY for this purpose
const steam_search_tag_id = 'https://store.steampowered.com/search/?tags=' 
// must add the TAG ID
const steam_search_tag_string = 'https://steamspy.com/api.php?request=tag&tag='
// must add the TAG as a String for example: ...tag&tag=Horror
const steam_retrieve_game_info = 'https://store.steampowered.com/api/appdetails?appids='
//must add the game ID at the, end link will retrieve game info as  a JSON
const steam_game_applist = 'https://api.steampowered.com/IStoreService/GetAppList/v1/?key='
//must add the API key in order to work. Additionally, other parameters can be added to the search
//for better filtering

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



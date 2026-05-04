import 'dotenv/config'
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';
import fetch from 'node-fetch';

const steam_api_key = process.env.STEAM_API_KEY
const steam_search_tag_id = 'https://store.steampowered.com/search/?tags='
// must add the TAG ID
const steam_search_tag_string = 'https://steamspy.com/api.php?request=tag&tag='
// must add the TAG as a String for example: ...tag&tag=Horror
const steam_retrieve_game_info = 'https://store.steampowered.com/api/appdetails?appids='
//must add the game ID at the, end link will retrieve game info as  a JSON
const steam_game_applist = 'https://api.steampowered.com/IStoreService/GetAppList/v1/?key='
//must add the API key in order to work. Additionally, other parameters can be added to the search
//for better filtering NOTE: that is API is not very updated it
const steam_search_game_by_name = 'https://store.steampowered.com/api/storesearch/?term='
//after the original link this string must be added and replace with <SEARCH_QUERY>&l=english&cc=US,
//in order to work <SEARCH_QUERY> has to be the game name (spaces must be replace with +).
//for instance when searching for Cyberpunk 2077... term=Cyberpunk+2077&l=engligh ... and will return a
//JSON that contains mulitple matches and this will include the game name (use in Steam) and the ID

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
    res.render('login');
});

app.post('/login', async(req, res) => {
    console.log(req.body);

    let username = req.body.username;
    let password = req.body.password;

    console.log(username + ": " + password);

    let hashedPassword = "";

    let sql = `SELECT *
               FROM admin
               WHERE username = ?`;

    const sqlParams = [username];
    const [rows] = await pool.query(sql, sqlParams);

    if (rows.length > 0) {
        hashedPassword = rows[0].password;
    }

    const match = await bcrypt.compare(password, hashedPassword);

    console.log(match);

    if (match) {
        req.session.authenticated = true;
        res.render('home.ejs', { game: null, spyData: null, rating: null });
    } else {
        let loginError = 'Wrong Credentials';
        res.render('login.ejs', {loginError});
    }
});


app.get('/games', async (req, res) => {
    try {
        let url = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/';
        let response = await fetch(url);
        let data = await response.json();

        // Get first 50 games (you can adjust)
        let games = data.applist.apps.slice(0, 50);

        res.render('home.ejs', { games });

    } catch (err) {
        console.error(err);
        res.send("Error fetching games");
    }
});

app.get('/searchGame', async (req, res) => {
    let search = req.query.name?.trim();

    if (!search) {
        return res.render('home.ejs', { game: null, spyData: null, rating: null });
    }

    try {
        // 1. SEARCH GAME BY NAME
        let searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(search)}&l=english&cc=US`;

        let searchRes = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });

        if (!searchRes.ok) {
            throw new Error(`Search API failed: ${searchRes.status}`);
        }

        let searchData = await searchRes.json();

        if (!searchData.items || searchData.items.length === 0) {
            return res.render('home.ejs', { game: null, spyData: null, rating: null });
        }

        let appid = searchData.items[0].id;

        // 2. GET GAME DETAILS
        let detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}`;

        let detailsRes = await fetch(detailsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });

        if (!detailsRes.ok) {
            throw new Error(`Details API failed: ${detailsRes.status}`);
        }

        let detailsData = await detailsRes.json();

        if (!detailsData[appid] || !detailsData[appid].success) {
            return res.render('home.ejs', { game: null, spyData: null, rating: null });
        }

        let game = detailsData[appid].data;

        // 3. GET STEAMSPY DATA
        let spyUrl = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;

        let spyRes = await fetch(spyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        let spyData = null;

        if (spyRes.ok) {
            try {
                spyData = await spyRes.json();
            } catch {
                console.log("SteamSpy returned non-JSON");
            }
        }

        // 4. RENDER PAGE
        let rating = null;
        if (spyData && spyData.positive && spyData.negative) {
            let total = spyData.positive + spyData.negative;
            rating = Math.round((spyData.positive / total) * 100);
        }

        res.render('home.ejs', { game, spyData, rating });

    } catch (err) {
        console.error("Search error:", err);
        res.render('home.ejs', { game: null, spyData: null, rating: null });
    }
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



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
app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.render('home.ejs', { game: null, spyData: null, rating: null });
    } else {
        res.render('login.ejs');
    }
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async(req, res) => {
    console.log(req.body);

    let username = req.body.username;
    let password = req.body.password;

    console.log(username + ": " + password);

    let hashedPassword = "";

    let sql = `SELECT *
               FROM users
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
        req.session.userId = rows[0].id;
        req.session.username = rows[0].username;
        res.render('home.ejs', { game: null, spyData: null, rating: null });
    } else {
        let loginError = 'Wrong Credentials';
        res.render('login.ejs', {loginError});
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        
        res.redirect('/login');
    });
});

app.get('/games', async (req, res) => {
    try {
        let url = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/';
        let response = await fetch(url);
        let data = await response.json();

        // Get first 50 games (you can adjust)
        let games = data.applist.apps.slice(0, 50);

        res.render('home.ejs', { games, game: null, spyData: null, rating: null });

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

        // console.log('=====================================');
        // console.log(`${JSON.stringify(game, null, 4)}\n====\n${JSON.stringify(spyData, null, 4)}`);
        // console.log('=====================================');


        res.render('home.ejs', { game, spyData, rating });

    } catch (err) {
        console.error("Search error:", err);
        res.render('home.ejs', { game: null, spyData: null, rating: null });
    }
});

// ==================== CATALOG =================

const steamCatalogCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchSteamCatalog() {
    if (steamCatalogCache.data && Date.now() - steamCatalogCache.fetchedAt < CACHE_TTL_MS) {
        return steamCatalogCache.data;
    }

    const spyRes = await fetch('https://steamspy.com/api.php?request=top100in2weeks', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!spyRes.ok) return [];

    const spyData = await spyRes.json();
    const topGames = Object.values(spyData).slice(0, 50);

    const detailResults = await Promise.allSettled(
        topGames.map(g =>
            fetch(`https://steamspy.com/api.php?request=appdetails&appid=${g.appid}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }).then(r => r.json())
        )
    );

    const result = topGames.map((g, i) => {
        const detail = detailResults[i].status === 'fulfilled' ? detailResults[i].value : null;
        return {
            appid: String(g.appid),
            title: g.name,
            genre: detail?.genre || 'N/A',
            platform: 'PC (Steam)',
            reviewHref: `/review/steam/${g.appid}`
        };
    });

    steamCatalogCache.data = result;
    steamCatalogCache.fetchedAt = Date.now();
    return result;
}

app.get('/catalog', isUserAuthenticated, async (req, res) => {
    try {
        const [dbGames] = await pool.query('SELECT * FROM games ORDER BY title');
        const dbAppIds = new Set(dbGames.map(g => String(g.steam_appid)).filter(Boolean));

        const normalizedDb = dbGames.map(g => ({
            appid: String(g.steam_appid || ''),
            title: g.title,
            genre: g.genre,
            platform: g.platform,
            reviewHref: `/review/game/${g.id}`
        }));

        let steamGames = [];
        try {
            const catalog = await fetchSteamCatalog();
            steamGames = catalog.filter(g => !dbAppIds.has(g.appid));
        } catch (spyErr) {
            console.error('SteamSpy fetch error:', spyErr);
        }

        res.render('catalog.ejs', { games: [...normalizedDb, ...steamGames] });
    } catch (err) {
        console.error('catalog fetch error:', err);
        res.status(500).send('Error loading catalog');
    }
});

app.get('/catalog/new', isUserAuthenticated, (req, res) => {
    res.render('newGame.ejs');
});

app.post('/catalog/new', isUserAuthenticated, async (req, res) => {
    try {
        const { title, genre, platform } = req.body;

        if (!title || !genre || !platform) {
            return res.status(400).send('Title, genre, and platform are required');
        }

        await pool.query(
            'INSERT INTO games (title, genre, platform) VALUES (?, ?, ?)',
            [title, genre, platform]
        );
        res.redirect('/catalog');
    } catch (err) {
        console.error('Library insert error:', err);
        res.status(500).send('Error saving game');
    }
});

// =================== REVIEWS =====================

async function fetchSteamDetails(appid) {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    const data = await res.json();
    return data[appid]?.success ? data[appid].data : null;
}

// For games already in the DB (catalog — manual or Steam-sourced)
app.get('/review/game/:id', isUserAuthenticated, async (req, res) => {
    try {
        const [[game]] = await pool.query('SELECT * FROM games WHERE id = ?', [req.params.id]);
        if (!game) return res.status(404).send('Game not found');

        const [[existing]] = await pool.query(
            'SELECT * FROM reviews WHERE user_id = ? AND game_id = ?',
            [req.session.userId, game.id]
        );

        res.render('review.ejs', { title: game.title, gameId: game.id, existing: existing || null, error: null });
    } catch (err) {
        console.error('review/game GET error:', err);
        res.status(500).send('Error loading review page');
    }
});

app.post('/review/game/:id', isUserAuthenticated, async (req, res) => {
    const { rating, review_text } = req.body;
    const ratingNum = parseInt(rating, 10);

    try {
        const [[game]] = await pool.query('SELECT * FROM games WHERE id = ?', [req.params.id]);
        if (!game) return res.status(404).send('Game not found');

        if (!ratingNum || ratingNum < 1 || ratingNum > 10 || !review_text?.trim()) {
            return res.render('review.ejs', { title: game.title, gameId: game.id, existing: null, error: 'Rating must be 1–10 and review text is required.' });
        }

        await pool.query(
            `INSERT INTO reviews (user_id, game_id, rating, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), review_text = VALUES(review_text)`,
            [req.session.userId, game.id, ratingNum, review_text.trim()]
        );

        res.redirect('/catalog');
    } catch (err) {
        console.error('review/game POST error:', err);
        res.status(500).send('Error saving review');
    }
});

// For games from Steam search that may not be in the DB yet
app.get('/review/steam/:appid', isUserAuthenticated, async (req, res) => {
    const appid = req.params.appid;
    try {
        const gameData = await fetchSteamDetails(appid);
        if (!gameData) return res.status(404).send('Game not found on Steam');

        const [[existing]] = await pool.query(
            `SELECT r.* FROM reviews r
             JOIN games g ON r.game_id = g.id
             WHERE r.user_id = ? AND g.steam_appid = ?`,
            [req.session.userId, appid]
        );

        res.render('review.ejs', { title: gameData.name, gameId: null, steamAppid: appid, existing: existing || null, error: null });
    } catch (err) {
        console.error('review/steam GET error:', err);
        res.status(500).send('Error loading review page');
    }
});

app.post('/review/steam/:appid', isUserAuthenticated, async (req, res) => {
    const appid = req.params.appid;
    const { rating, review_text } = req.body;
    const ratingNum = parseInt(rating, 10);

    try {
        const gameData = await fetchSteamDetails(appid);
        if (!gameData) return res.status(404).send('Game not found on Steam');

        if (!ratingNum || ratingNum < 1 || ratingNum > 10 || !review_text?.trim()) {
            return res.render('review.ejs', { title: gameData.name, gameId: null, steamAppid: appid, existing: null, error: 'Rating must be 1–10 and review text is required.' });
        }

        const title = gameData.name;
        const genre = gameData.genres?.map(g => g.description).join(', ') || 'Unknown';
        const platform = [
            gameData.platforms?.windows ? 'Windows' : null,
            gameData.platforms?.mac ? 'Mac' : null,
            gameData.platforms?.linux ? 'Linux' : null,
        ].filter(Boolean).join(', ') || 'Unknown';

        await pool.query(
            `INSERT INTO games (title, genre, platform, steam_appid)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title)`,
            [title, genre, platform, appid]
        );

        const [[gameRow]] = await pool.query('SELECT id FROM games WHERE steam_appid = ?', [appid]);

        await pool.query(
            `INSERT INTO reviews (user_id, game_id, rating, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), review_text = VALUES(review_text)`,
            [req.session.userId, gameRow.id, ratingNum, review_text.trim()]
        );

        res.redirect('/catalog');
    } catch (err) {
        console.error('review/steam POST error:', err);
        res.status(500).send('Error saving review');
    }
});

// =================== PROFILE ======================

app.get('/profile', isUserAuthenticated, async (req, res) => {
    try {
        const [reviews] = await pool.query(
            `SELECT g.title, g.steam_appid, r.rating, r.review_text, r.created_at
             FROM reviews r
             JOIN games g ON r.game_id = g.id
             WHERE r.user_id = ?
             ORDER BY r.created_at DESC`,
            [req.session.userId]
        );
        res.render('profile.ejs', { username: req.session.username, reviews });
    } catch (err) {
        console.error('profile error:', err);
        res.status(500).send('Error loading profile');
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



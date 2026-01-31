// ... existing imports
const seedRoutes = require('./routes/seedRoutes'); // <--- ADD THIS

const app = express();

// ... existing middleware

// ... existing routes
app.use('/api/admin', seedRoutes); // <--- ADD THIS

// ... app.listen

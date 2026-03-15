import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

const LEADERBOARD_FILE = path.join(process.cwd(), "leaderboard.json");

// Initialize leaderboard file if it doesn't exist
if (!fs.existsSync(LEADERBOARD_FILE)) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify([]));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/leaderboard", (req, res) => {
    try {
      const data = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
      const leaderboard = JSON.parse(data);
      // Sort by score descending and take top 10
      const top10 = leaderboard.sort((a: any, b: any) => b.score - a.score).slice(0, 10);
      res.json(top10);
    } catch (error) {
      res.status(500).json({ error: "Failed to read leaderboard" });
    }
  });

  app.post("/api/leaderboard", (req, res) => {
    try {
      const { name, score, world, character } = req.body;
      if (!name || score === undefined) {
        return res.status(400).json({ error: "Name and score are required" });
      }

      const data = fs.readFileSync(LEADERBOARD_FILE, "utf-8");
      const leaderboard = JSON.parse(data);
      
      leaderboard.push({
        id: Date.now(),
        name,
        score,
        world,
        character,
        date: new Date().toISOString()
      });

      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save score" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

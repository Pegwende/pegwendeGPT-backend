import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mysql from "mysql2/promise";
import axios from "axios";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;

const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

console.log("Connected to MySQL database");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/workgpt", async (req, res) => {
    const userQuestion = req.query.question;
    const userName = req.query.name || "Guest";  // Get user name (or set "Guest")
    const userEmail = req.query.email || null;   // Get email if available
    const userIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress; // Get IP address

    if (!userQuestion) {
        return res.status(400).json({ error: "Please provide a question" });
    }

    try {
        // Fetch user location
        let userLocation = "Unknown";
        try {
            const locationResponse = await axios.get(`http://ip-api.com/json/${userIP}`);
            if (locationResponse.data && locationResponse.data.city) {
                userLocation = `${locationResponse.data.city}, ${locationResponse.data.country}`;
            }
        } catch (error) {
            console.log("Failed to fetch user location:", error);
        }

        // Check if question exists in MySQL
        const [rows] = await db.execute("SELECT id, answer, usage_count FROM questions WHERE question = ?", [userQuestion]);

        let aiAnswer;
        if (rows.length > 0) {
            // If found, update usage count and return existing answer
            const questionId = rows[0].id;
            aiAnswer = rows[0].answer;
            const newCount = rows[0].usage_count + 1;
            await db.execute("UPDATE questions SET usage_count = ? WHERE id = ?", [newCount, questionId]);
        } else {
            // If not found, generate answer using AI
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

            const result = await model.generateContent({
                contents: [{
                    role: "user",
                    parts: [{ text: `Provide a professional answer. Keep the response short (1-5 sentences). Question: ${userQuestion}` }]
                }]
            });

            aiAnswer = result.response.text();

            // Store new question in MySQL
            await db.execute("INSERT INTO questions (question, answer, usage_count) VALUES (?, ?, ?)", 
                [userQuestion, aiAnswer, 1]);
        }

        // Log user activity
        await db.execute(
            "INSERT INTO user_activity (user_name, email, ip_address, location, question, timestamp) VALUES (?, ?, ?, ?, ?, NOW())",
            [userName, userEmail, userIP, userLocation, userQuestion]
        );

        res.json({ answer: aiAnswer });

    } catch (error) {
        console.error("Error:", error);
        res.json({ answer: "Sorry, Peg-AI is taking a break! Try again later." });
    }
});

app.listen(PORT, () => console.log(`Peg-AI is running on port ${PORT}`));

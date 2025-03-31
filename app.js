import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Read the data from the file
const loadQuestions = () => {
    try {
        const data = fs.readFileSync('questions.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log("Error reading questions from file:", error);
        return [];
    }
};

// Save the updated data to the file
const saveQuestions = (data) => {
    try {
        fs.writeFileSync('questions.json', JSON.stringify(data, null, 2));
    } catch (error) {
        console.log("Error writing questions to file:", error);
    }
};

// Load the questions from the JSON file at the start of the server
let predefinedAnswers = loadQuestions();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/workgpt", async (req, res) => {
    const userQuestion = req.query.question;
    console.log("userQuestion: ", userQuestion);

    // Check if the question matches any predefined ones
    const predefinedAnswer = predefinedAnswers.find(item => 
      item.question.toLowerCase() === userQuestion.toLowerCase()
    );

    if (predefinedAnswer) {
        // If a predefined answer is found, send it as the response
        return res.json({ answer: predefinedAnswer.answer });
    }

    
    try {
        // Fallback Generate response using Google Gemini API
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{ text: `Provide a professional answer. Keep the response short (1-5 sentences). Question: ${userQuestion}` }]
            }]
        });
        const aiAnswer = result.response.text();
        // const response = await openai.chat.completions.create({
        //     model: "gpt-3.5-turbo",
        //     messages: [{ role: "system", content: "You are an AI assistant for Workday employees." }, 
        //                { role: "user", content: userQuestion }]
        // });

        // const aiAnswer = response.choices[0].message.content;

        // Save the new question and answer to the predefined array
        predefinedAnswers.push({ question: userQuestion, answer: aiAnswer });

        // Save the updated questions back to the JSON file
        saveQuestions(predefinedAnswers);

        // Send the response back to the user
        res.json({ answer: aiAnswer });
    } catch (error) {
        // If OpenAI is down, send a message indicating that AI is unavailable
        console.error( "error", error );
        res.send({ answer: "Sorry Peg-AI is taking a break! Try again later." });
    }
});

const PORT = 8081;
app.listen(PORT, () => console.log(`Peg-AI is running on port ${PORT}`));

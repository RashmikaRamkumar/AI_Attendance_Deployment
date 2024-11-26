const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const multer = require("multer");
//console.log('attendanceRoutes.js loaded');  // Log to confirm if file is being loaded

// Route to mark students as "On Duty"
router.post('/onDuty', attendanceController.markOnDuty);

// Route to fetch students not marked as "On Duty"
router.get('/remaining', attendanceController.fetchRemainingStudents);

// Route to mark students as "Absent"
router.post('/absent', attendanceController.markAbsent);

// Route to mark remaining students as "Present"
router.post('/mark-remaining-present', attendanceController.markRemainingPresent);

const storage = multer.memoryStorage(); // Store files in memory, not on disk
const upload = multer({ storage: storage });
router.post("/send-email",upload.single("file"), attendanceController.sendEmail);

module.exports = router;


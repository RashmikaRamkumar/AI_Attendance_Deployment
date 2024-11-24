const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
};
// Controller to generate message of absent students
exports.generateAbsentStudentsMessage = async (req, res) => {
    const { yearOfStudy, branch, section, date } = req.query;

    try {
        // Step 1: Fetch all students in the specified year, branch, and section
        const allStudents = await Student.find({ yearOfStudy, branch, section }).select('rollNo name hostellerDayScholar');

        // Step 2: Fetch attendance records for the specified date, year, branch, and section
        const attendanceRecords = await Attendance.find({ date, yearOfStudy, branch, section });

        // Step 3: Ensure each student has a record in the attendance collection
        const studentsWithAttendance = attendanceRecords.map(record => record.rollNo);
        const missingRecords = allStudents.filter(student => !studentsWithAttendance.includes(student.rollNo));

        // If there are missing attendance records, return an error message
        if (missingRecords.length > 0) {
            // Sort the missing records by rollNo in ascending order
            missingRecords.sort((a, b) => {
                const numA = parseInt(a.rollNo.replace(/\D/g, '')); // Extract numeric part
                const numB = parseInt(b.rollNo.replace(/\D/g, ''));
                return numA - numB; // Compare numeric values
            });

            return res.status(400).json({
                message: "Not all students have attendance records for the specified day.",
                missingStudents: missingRecords.map(student => ({ rollNo: student.rollNo, name: student.name }))
            });
        }

        // Step 4: Identify absent students
        const absentStudents = attendanceRecords
            .filter(record => record.status === 'Absent')
            .map(record => {
                const student = allStudents.find(student => student.rollNo === record.rollNo);
                const hostellerOrDayScholar = student.hostellerDayScholar === 'HOSTELLER' ? '(Hostel)' : '(Day Scholar)';
                return `Roll No: ${record.rollNo}-${student.name} ${hostellerOrDayScholar}`;
            });


            // Step 5: Format the date before using it in the message
        const formattedDate = formatDate(date);
        let mHeader = `${yearOfStudy} year ${branch}-${section}\nDate : ${formattedDate}\n`;

        if (absentStudents.length === 0) {
            return res.json({ 
                
                message: mHeader,
                details: "NIL ABSENTEES"});
        }


        // Step 6: Generate and send the message
        let messageHeader = ` ${yearOfStudy} year ${branch}-${section}\nDate : ${formattedDate}\nTHE FOLLOWING STUDENTS ARE ABSENT`;

        let absentDetails = absentStudents.join('\n');

        // Send the response with the formatted message and details
        res.json({
            message: messageHeader,
            details: absentDetails
        });

        // Step 7: Lock the attendance for this date, year, branch, and section
        await Attendance.updateMany(
            { date, yearOfStudy, branch, section },
            { locked: true }
        );

        console.log(`Attendance locked for ${yearOfStudy} ${branch} ${section} on ${formattedDate}`);

    } catch (error) {
        console.error("Error generating absent students message:", error);
        res.status(500).json({ message: "Error generating absent students message" });
    }
};



//Generate content for Hostel Gmail Report
// Convert Roman numeral to integer
// Helper function to convert Roman numerals to integers for sorting
const romanToInt = (roman) => {
    const romanNumerals = {
        'I': 1,
        'II': 2,
        'III': 3,
        'IV': 4
    };
    return romanNumerals[roman] || 0; // Return 0 if invalid Roman numeral
};

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const reportDir = path.join(__dirname, '..', 'reports'); // Adjust the path if needed

// Ensure the directory exists
if (!fs.existsSync(reportDir)) {
    console.log('Report directory does not exist. Creating directory:', reportDir);
    fs.mkdirSync(reportDir);
} else {
    console.log('Report directory already exists:', reportDir);
}


exports.handleAbsentStudentsReport = async (gender, req, res) => {
    const { date } = req.query;
    console.log('Request received to generate report for gender:', gender, 'and date:', date);

    try {
        // Fetch all students of the specified gender
        const allStudents = await Student.find({ gender }).select('rollNo name yearOfStudy branch section hostellerDayScholar');
        console.log('Total students fetched:', allStudents.length);

        // Fetch attendance records for the specified date (only absent students)
        const attendanceRecords = await Attendance.find({ date, status: 'Absent' }).select('rollNo');
        console.log('Total attendance records fetched for absent students:', attendanceRecords.length);

        // Filter students who were absent on the given date
        const absentStudents = allStudents.filter(student =>
            attendanceRecords.some(record => record.rollNo === student.rollNo)
        );
        console.log('Absent Students before hostel filter:', absentStudents);

        // Filter absent students to include only HOSTELLER or HOSTELER
        const filteredAbsentStudents = absentStudents.filter(student =>
            student.hostellerDayScholar && 
            (student.hostellerDayScholar.toUpperCase() === 'HOSTELLER' || student.hostellerDayScholar.toUpperCase() === 'HOSTELER')
        );
        console.log('Filtered Absent Students:', filteredAbsentStudents);

        if (filteredAbsentStudents.length === 0) {
            console.log(`No absent ${gender.toLowerCase()} students found for ${date}.`);
            return res.status(404).json({ message: `No absent ${gender.toLowerCase()} students found for ${date}.` });
        }

        // Sort absent students by yearOfStudy (Roman numeral order) and then by rollNo
        filteredAbsentStudents.sort((a, b) => {
            const yearA = romanToInt(a.yearOfStudy);
            const yearB = romanToInt(b.yearOfStudy);
            if (yearA === yearB) {
                const rollNoA = parseInt(a.rollNo.replace(/\D/g, '')); // Extract numeric part of rollNo
                const rollNoB = parseInt(b.rollNo.replace(/\D/g, ''));
                return rollNoA - rollNoB;
            }
            return yearA - yearB;
        });

        console.log('Absent students sorted successfully');
        const formattedDate = formatDate(date);

        // Determine Hostel type based on gender (Boys or Girls)
        const hostelType = gender === 'MALE' ? 'Boys' : 'Girls';

        // Prepare the report data with merged header rows
        const reportData = [
            ['Kongu Engineering College'],
            ['Department of Artificial Intelligence'],
            [`${hostelType} Hostel Students Absentees List - ${formattedDate}`],
            ['S.No', 'Roll No', 'Student Name', 'Year', 'Branch']
        ];

        // Add the absent students' data
        filteredAbsentStudents.forEach((student, index) => {
            reportData.push([
                index + 1,
                student.rollNo,
                student.name,
                student.yearOfStudy,
                `${student.branch}-${student.section}`
            ]);
        });

        // Create a new workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Absent Students');

        // Add the report data to the worksheet
        worksheet.addRows(reportData);

        // Apply row height adjustments
        worksheet.getRow(1).height = 25; // First header row
        worksheet.getRow(2).height = 25; // Second header row
        worksheet.getRow(3).height = 25; // Third header row
        worksheet.getRow(4).height = 25; // Column headers row
        for (let row = 5; row <= reportData.length; row++) {
            worksheet.getRow(row).height = 25; // Data rows
        }

        // Apply thicker borders around the header and filled cells (data rows)
        const borderStyle = {
            top: { style: 'medium' },
            left: { style: 'medium' },
            bottom: { style: 'medium' },
            right: { style: 'medium' },
        };

        // Apply borders for header row (row 4)
        for (let col = 1; col <= 5; col++) {
            worksheet.getCell(4, col).border = borderStyle;
            worksheet.getCell(4, col).alignment = { horizontal: 'center', vertical: 'middle' }; // Center-align
            worksheet.getCell(4, col).font = { bold: true, name: 'Times New Roman', size: 12 };
        }

        // Apply borders for each row with student data (starting from row 5)
        for (let row = 5; row <= reportData.length; row++) {
            for (let col = 1; col <= 5; col++) {
                worksheet.getCell(row, col).border = borderStyle;
                worksheet.getCell(row, col).alignment = { horizontal: 'center', vertical: 'middle' }; // Center-align
                worksheet.getCell(row, col).font = { name: 'Times New Roman', size: 12 };
            }
        }

        console.log('Borders and alignment applied successfully.');

        // Merge and center the header cells
        worksheet.mergeCells('A1:E1'); // Merging the first header row
        worksheet.mergeCells('A2:E2'); // Merging the second header row
        worksheet.mergeCells('A3:E3'); // Merging the third header row

        // Set header cell alignment to center
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getCell('A1').font = { name: 'Times New Roman', size: 12, bold: true };
        worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getCell('A2').font = { name: 'Times New Roman', size: 12, bold: true };
        worksheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getCell('A3').font = { name: 'Times New Roman', size: 12, bold: true };

        console.log('Header merged and centered successfully.');

        // Define file path and name
        const fileName = `${hostelType}_Absent_Students_${formattedDate}.xlsx`;
        const filePath = path.join(reportDir, fileName);

        // Write the workbook to the file
        try {
            await workbook.xlsx.writeFile(filePath);
            console.log('Excel file created successfully:', filePath);
        } catch (writeError) {
            console.error('Error writing the Excel file:', writeError);
            return res.status(500).json({ message: 'Failed to create the Excel report.' });
        }

        // Return the response with a link to download the report
        res.json({
            message: `Absent ${gender.toLowerCase()} students report for ${formattedDate} is ready.`,
            reportLink: `/reports/${fileName}`
        });

    } catch (error) {
        console.error("Error generating report:", error);
        res.status(500).json({ message: 'Error generating absent students report' });
    }
};


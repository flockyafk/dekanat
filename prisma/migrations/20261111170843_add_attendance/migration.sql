-- CreateTable
CREATE TABLE "Attendance" (
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "held" INTEGER NOT NULL,
    "attended" INTEGER NOT NULL,

    PRIMARY KEY ("studentId", "courseId"),
    CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

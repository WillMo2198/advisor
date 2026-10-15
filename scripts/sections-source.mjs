// SAMPLE section data for Fall 2026. It is NOT the real IIT schedule.
// CRNs, times, rooms, seats, and instructor names are made up so the app has something to show.
// To use real data, run the pop.ai scraper and import its export (see README.md).
//
// Row format: [course, crn, bucket, scheduleType, days, time, where, instructor, seatsAvailable]
// `time` uses the same format as pop.ai's scraper ("11:25 AM - 12:40 PM").

export const semester = 'Fall 2026';
export const termCode = '202710'; // pop.ai term_code('fall', 2026)

export const rows = [
  ['CS 100', 10101, 'Class', 'Lecture', 'W', '3:15 PM - 4:30 PM', 'Stuart Building 104', 'Dana Whitaker', 18],
  ['CS 100', 10102, 'Class', 'Lecture', 'R', '3:15 PM - 4:30 PM', 'Stuart Building 104', 'Dana Whitaker', 4],

  ['CS 104', 10111, 'Class', 'Lecture', 'MW', '8:35 AM - 9:50 AM', 'Rettaliata Engr Center 104', 'Omar Haddad', 22],

  ['CS 115', 10121, 'Class', 'Lecture', 'MW', '10 AM - 11:15 AM', 'Perlstein Hall 131', 'Grace Liu', 12],
  ['CS 115', 10122, 'Class', 'Lab', 'F', '10 AM - 11:40 AM', 'Stuart Building 006', 'Grace Liu', 6],
  ['CS 115', 10123, 'Class', 'Lab', 'F', '1:50 PM - 3:30 PM', 'Stuart Building 006', 'Grace Liu', 0],

  ['CS 116', 10131, 'Class', 'Lecture', 'TR', '10 AM - 11:15 AM', 'Perlstein Hall 131', 'Marcus Bell', 9],
  ['CS 116', 10132, 'Class', 'Lab', 'W', '3:15 PM - 4:55 PM', 'Stuart Building 006', 'Marcus Bell', 9],

  ['CS 201', 10141, 'Class', 'Lecture', 'MWF', '9 AM - 9:50 AM', 'Wishnick Hall 113', 'Priya Raman', 15],
  ['CS 201', 10142, 'Class', 'Lab', 'R', '1:50 PM - 3:30 PM', 'Stuart Building 006', 'Priya Raman', 15],

  ['CS 330', 10151, 'Class', 'Lecture', 'TR', '1:50 PM - 3:05 PM', 'Stuart Building 113', 'Elena Sokolova', 20],

  ['CS 331', 10161, 'Class', 'Lecture', 'TR', '10 AM - 11:15 AM', 'Stuart Building 111', 'Victor Chen', 7],
  ['CS 331', 10162, 'Class', 'Lecture', 'MW', '1:50 PM - 3:05 PM', 'Stuart Building 111', 'Victor Chen', 25],
  ['CS 331', 10163, 'Internet', 'Lecture', 'TBA', 'TBA', 'Internet', 'Victor Chen', 30],

  ['CS 340', 10171, 'Class', 'Lecture', 'MW', '11:25 AM - 12:40 PM', 'Stuart Building 113', 'Hannah Novak', 14],

  ['CS 350', 10181, 'Class', 'Lecture', 'TR', '8:35 AM - 9:50 AM', 'Rettaliata Engr Center 106', 'Samuel Adeyemi', 11],

  ['CS 351', 10191, 'Class', 'Lecture', 'MW', '3:15 PM - 4:30 PM', 'Rettaliata Engr Center 106', 'Samuel Adeyemi', 3],

  ['CS 411', 10201, 'Class', 'Lecture', 'TR', '3:15 PM - 4:30 PM', 'Stuart Building 104', 'Tomas Ortega', 16],

  ['CS 422', 10211, 'Class', 'Lecture', 'M', '6:25 PM - 9:05 PM', 'Stuart Building 111', 'Laura Jensen', 27],

  ['CS 425', 10221, 'Class', 'Lecture', 'MW', '10 AM - 11:15 AM', 'Siegel Hall 118', 'Irene Park', 13],
  ['CS 425', 10222, 'Internet', 'Lecture', 'TBA', 'TBA', 'Internet', 'Irene Park', 40],

  ['CS 430', 10231, 'Class', 'Lecture', 'TR', '11:25 AM - 12:40 PM', 'Stuart Building 104', 'Elena Sokolova', 8],

  ['CS 440', 10241, 'Class', 'Lecture', 'MW', '3:15 PM - 4:30 PM', 'Siegel Hall 118', 'Hannah Novak', 19],

  ['CS 445', 10251, 'Class', 'Lecture', 'TR', '1:50 PM - 3:05 PM', 'Siegel Hall 118', 'Marcus Bell', 21],

  ['CS 450', 10261, 'Class', 'Lecture', 'MW', '11:25 AM - 12:40 PM', 'Rettaliata Engr Center 104', 'Samuel Adeyemi', 5],

  ['CS 458', 10271, 'Class', 'Lecture', 'T', '6:25 PM - 9:05 PM', 'Stuart Building 113', 'Omar Haddad', 24],

  ['CS 480', 10281, 'Class', 'Lecture', 'TR', '11:25 AM - 12:40 PM', 'Perlstein Hall 131', 'Laura Jensen', 2],

  ['CS 481', 10291, 'Class', 'Lecture', 'MW', '1:50 PM - 3:05 PM', 'Perlstein Hall 131', 'Tomas Ortega', 17],

  ['CS 484', 10301, 'Class', 'Lecture', 'TR', '3:15 PM - 4:30 PM', 'Wishnick Hall 113', 'Laura Jensen', 0],

  ['CS 487', 10311, 'Class', 'Lecture', 'MW', '8:35 AM - 9:50 AM', 'Stuart Building 104', 'Irene Park', 23],

  ['MATH 151', 20101, 'Class', 'Lecture', 'MWF', '10 AM - 10:50 AM', 'Life Sciences 152', 'Rosa Delgado', 30],
  ['MATH 151', 20102, 'Class', 'Recitation/Discussion', 'T', '10 AM - 11:15 AM', 'Life Sciences 152', 'Rosa Delgado', 30],

  ['MATH 152', 20111, 'Class', 'Lecture', 'MWF', '1:50 PM - 2:40 PM', 'Life Sciences 152', 'Kenji Mori', 26],
  ['MATH 152', 20112, 'Class', 'Recitation/Discussion', 'R', '10 AM - 11:15 AM', 'Life Sciences 152', 'Kenji Mori', 26],

  ['MATH 230', 20121, 'Class', 'Lecture', 'TR', '1:50 PM - 3:05 PM', 'Rettaliata Engr Center 119', 'Ana Petrova', 12],

  ['MATH 251', 20131, 'Class', 'Lecture', 'MWF', '10 AM - 10:50 AM', 'Rettaliata Engr Center 119', 'Kenji Mori', 10],
  ['MATH 251', 20132, 'Class', 'Lecture', 'TR', '11:25 AM - 12:40 PM', 'Rettaliata Engr Center 119', 'Ana Petrova', 18],

  ['MATH 252', 20141, 'Class', 'Lecture', 'MWF', '11:25 AM - 12:15 PM', 'Life Sciences 111', 'Rosa Delgado', 22],

  ['MATH 332', 20151, 'Class', 'Lecture', 'TR', '8:35 AM - 9:50 AM', 'Life Sciences 111', 'Ana Petrova', 15],

  ['MATH 474', 20161, 'Class', 'Lecture', 'MW', '11:25 AM - 12:40 PM', 'Rettaliata Engr Center 119', 'Benjamin Hart', 9],
  ['MATH 474', 20162, 'Class', 'Lecture', 'TR', '1:50 PM - 3:05 PM', 'Life Sciences 111', 'Benjamin Hart', 16],

  ['MATH 475', 20171, 'Class', 'Lecture', 'TR', '3:15 PM - 4:30 PM', 'Life Sciences 111', 'Benjamin Hart', 20],
];

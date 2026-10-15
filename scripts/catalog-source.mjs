// Source for data/catalog.json.
// Course facts come from the IIT undergraduate catalog (catalog.iit.edu/courses/cs and /math),
// read in October 2026. Descriptions are short paraphrases. `prereqText` is the catalog wording.
// `prereq` is the same rule stored as a tree: AND / OR nodes with course and text leaves.
// Run `npm run build:data` after you edit this file.

const c = (code, opts = {}) => ({ type: 'course', code, ...opts });
const any = (...children) => ({ type: 'or', children });
const all = (...children) => ({ type: 'and', children });
const t = (text) => ({ type: 'text', text });

const CONCURRENT_NOTE = 'An asterisk (*) designates a course which may be taken concurrently.';

export const departments = {
  CS: 'Computer Science',
  MATH: 'Mathematics',
};

export const courses = [
  // ---------- Computer Science ----------
  {
    code: 'CS 100', title: 'Introduction to the Profession', credits: '2',
    description: 'Introduces science and engineering as professions: how problems are solved and how solutions are judged against computational, financial, and social limits.',
    satisfies: 'Communications (C)', prereqText: '', prereq: null,
  },
  {
    code: 'CS 104', title: 'Introduction to Computer Programming for Engineers', credits: '2',
    description: 'High-level programming as an engineering problem-solving tool, with basic data structures, algorithms, and documentation. For students new to coding.',
    satisfies: 'Computing (COMP)', prereqText: '', prereq: null,
  },
  {
    code: 'CS 105', title: 'Introduction to Computer Programming', credits: '2',
    description: 'Programming for problem solving for students with little or no coding background, covering data structures, algorithms, and documentation.',
    satisfies: 'Computing (COMP)', prereqText: '', prereq: null,
  },
  {
    code: 'CS 110', title: 'Computing Principles', credits: '2',
    description: 'Core computing ideas: abstraction, algorithms, data, programming, the internet, and the global effects of computing.',
    satisfies: 'Computing (COMP)', prereqText: '', prereq: null,
  },
  {
    code: 'CS 115', title: 'Object-Oriented Programming I', credits: '2',
    description: 'Object-oriented programming as a problem-solving tool, with basic data structures, algorithms, and documentation. Made for students with little or no programming experience.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'CS 116', title: 'Object-Oriented Programming II', credits: '2',
    description: 'Advanced object-oriented topics such as dynamic data structures, recursion, searching, and sorting. For students in CS and CS-related programs.',
    satisfies: '', prereqText: 'CS 115 with min. grade of C',
    prereq: c('CS 115', { minGrade: 'C' }),
  },
  {
    code: 'CS 180', title: 'Artificial Intelligence Foundations', credits: '3',
    description: 'A hands-on introduction to AI for all majors: practical tool use, ethics, privacy, and human-AI collaboration.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'CS 201', title: 'Accelerated Introduction to Computer Science', credits: '4',
    description: 'Problem solving and design with an object-oriented language. Introduces problem-solving techniques, algorithms, and data structures.',
    satisfies: '',
    prereqText: 'CS 104 with min. grade of C or CS 105 with min. grade of C or CS 110 with min. grade of C or CS 115 with min. grade of C or Graduate standing',
    prereq: any(
      c('CS 104', { minGrade: 'C' }), c('CS 105', { minGrade: 'C' }),
      c('CS 110', { minGrade: 'C' }), c('CS 115', { minGrade: 'C' }),
      t('Graduate standing'),
    ),
  },
  {
    code: 'CS 330', title: 'Discrete Structures', credits: '3',
    description: 'Formal mathematical structures for problems and computation: Boolean algebra, first-order logic, recursive structures, graphs, and abstract language models.',
    satisfies: '', prereqText: 'CS 201 or CS 116',
    prereq: any(c('CS 201'), c('CS 116')),
  },
  {
    code: 'CS 331', title: 'Data Structures and Algorithms', credits: '3',
    description: 'Implementing and using essential data structures, and analyzing basic sorting and searching algorithms and how they relate to those structures.',
    satisfies: '', prereqText: 'CS 116 or CS 201',
    prereq: any(c('CS 116'), c('CS 201')),
  },
  {
    code: 'CS 340', title: 'Programming Paradigms and Patterns', credits: '3',
    description: 'Programming patterns through a functional lens using Haskell: monads, concurrency, domain-specific languages, and property-based testing.',
    satisfies: '', prereqText: 'CS 116 or CS 201',
    prereq: any(c('CS 116'), c('CS 201')),
  },
  {
    code: 'CS 350', title: 'Computer Organization and Assembly Language Programming', credits: '3',
    description: 'Internal computer architecture and how hardware, instruction sets, and high-level languages relate, with assembly language exercises.',
    satisfies: '', prereqText: `CS 116* or CS 201*, ${CONCURRENT_NOTE}`,
    prereq: any(c('CS 116', { concurrent: true }), c('CS 201', { concurrent: true })),
  },
  {
    code: 'CS 351', title: 'Systems Programming', credits: '3',
    description: 'Parts of multilayer software systems such as device drivers, systems software, and user interfaces, and the design of interrupt-driven and event-driven software.',
    satisfies: '', prereqText: '(CS 331 and CS 350) or (CS 331 and ECE 242)',
    prereq: any(all(c('CS 331'), c('CS 350')), all(c('CS 331'), c('ECE 242'))),
  },
  {
    code: 'CS 397', title: 'Special Projects', credits: 'Variable',
    description: 'Special projects. Needs instructor permission.',
    satisfies: '', prereqText: 'Instructor permission required.',
    prereq: t('Instructor permission'),
  },
  {
    code: 'CS 401', title: 'Introduction to Advanced Studies I', credits: '3', bridge: true,
    description: 'Prepares students for graduate study with data structures and algorithms in Java and their math foundations. Does not count toward M.S. or Ph.D. credit.',
    satisfies: '', prereqText: 'CS 200 or CS 201',
    prereq: any(c('CS 200'), c('CS 201')),
  },
  {
    code: 'CS 402', title: 'Introduction to Advanced Studies II', credits: '3', bridge: true,
    description: 'Layered construction of software systems, from device drivers to user interfaces, and how architecture shapes software.',
    satisfies: '', prereqText: 'CS 401 or CSSP 401 with min. grade of S',
    prereq: any(c('CS 401'), c('CSSP 401', { minGrade: 'S' })),
  },
  {
    code: 'CS 403', title: 'Foundations to Advanced Studies', credits: '6', bridge: true,
    description: 'Combines CS 401 and CS 402 into one course: data structures, software development, architecture, assembly language, event handling, and multithreading.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'CS 406', title: 'Introduction to Discrete Structures and Algorithms', credits: '3',
    description: 'Basic discrete math and algorithm design, with proofs, worst-case and average-case analysis, and approximation and randomized algorithms.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'CS 411', title: 'Computer Graphics', credits: '3',
    description: 'Display devices, 2D and 3D vector graphics, image generation, transformations, hidden-line removal, and projections.',
    satisfies: 'CS Technical Elective (T)',
    prereqText: '(CS 331 or CS 401 or CSSP 401 with min. grade of S) and (MATH 332 or MATH 333)',
    prereq: all(
      any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' })),
      any(c('MATH 332'), c('MATH 333')),
    ),
  },
  {
    code: 'CS 415', title: 'Introduction to Human-Computer Interaction', credits: '3',
    description: 'Human-computer interaction through the design process and a semester project: prototyping, user testing, ethics, and accessibility.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 331 or CS 401',
    prereq: any(c('CS 331'), c('CS 401')),
  },
  {
    code: 'CS 422', title: 'Data Mining', credits: '3',
    description: 'Data mining methods such as market basket analysis, nearest neighbor, decision trees, and clustering, practiced through implementation.',
    satisfies: 'CS Technical Elective (T)',
    prereqText: 'CS 331 or CS 401 or CSSP 401 with min. grade of S or CS 403',
    prereq: any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' }), c('CS 403')),
  },
  {
    code: 'CS 425', title: 'Database Organization', credits: '3',
    description: 'Database architectures (relational, hierarchical, network, object) and database interfaces such as SQL.',
    satisfies: '',
    prereqText: 'CS 331 or CS 401 or CSSP 401 with min. grade of S or CS 403',
    prereq: any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' }), c('CS 403')),
  },
  {
    code: 'CS 429', title: 'Information Retrieval', credits: '3',
    description: 'Information retrieval theory and search engine parts. Students build a prototype search engine.',
    satisfies: 'CS Technical Elective (T)',
    prereqText: 'CS 331 or CS 401 or CSSP 401 with min. grade of S',
    prereq: any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' })),
  },
  {
    code: 'CS 430', title: 'Introduction to Algorithms', credits: '3',
    description: 'Design, behavior, and analysis of algorithms, with focus on searching, sorting, and combinatorial algorithms, and worst-case, amortized, and expected bounds.',
    satisfies: '',
    prereqText: '(CS 331 and CS 330) or (CS 331 and MATH 230) or CS 401 or CSSP 401 with min. grade of S or CS 403',
    prereq: any(
      all(c('CS 331'), c('CS 330')), all(c('CS 331'), c('MATH 230')),
      c('CS 401'), c('CSSP 401', { minGrade: 'S' }), c('CS 403'),
    ),
  },
  {
    code: 'CS 440', title: 'Programming Languages and Translators', credits: '3',
    description: 'Common programming languages with precise definitions and practical use, plus an introduction to scanning, parsing, and compiler design.',
    satisfies: '',
    prereqText: '(CS 331 and CS 330) or (CS 331 and MATH 230) or CS 401 or CSSP 401 with min. grade of S or CS 403',
    prereq: any(
      all(c('CS 331'), c('CS 330')), all(c('CS 331'), c('MATH 230')),
      c('CS 401'), c('CSSP 401', { minGrade: 'S' }), c('CS 403'),
    ),
  },
  {
    code: 'CS 443', title: 'Compiler Construction', credits: '3',
    description: 'Students build a compiler step by step: syntax trees, intermediate representations, type checking, and function implementation.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 440',
    prereq: c('CS 440'),
  },
  {
    code: 'CS 445', title: 'Object Oriented Design and Programming', credits: '3',
    description: 'Methods for object-oriented design and programming, and how the object model is built in different languages.',
    satisfies: 'CS Technical Elective (T)',
    prereqText: 'CS 331 or CS 401 or CSSP 401 with min. grade of S or CS 403',
    prereq: any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' }), c('CS 403')),
  },
  {
    code: 'CS 450', title: 'Operating Systems', credits: '3',
    description: 'Operating system concepts, including scheduling, process management, deadlocks, and memory management.',
    satisfies: '',
    prereqText: 'CS 351 or CS 401 or CSSP 401 and CS 402 or CSSP 402 or CS 403',
    note: 'The catalog text has no parentheses. Stored as: CS 351, or (CS 401 or CSSP 401) and (CS 402 or CSSP 402), or CS 403.',
    prereq: any(
      c('CS 351'),
      all(any(c('CS 401'), c('CSSP 401')), any(c('CS 402'), c('CSSP 402'))),
      c('CS 403'),
    ),
  },
  {
    code: 'CS 451', title: 'Introduction to Parallel and Distributed Computing', credits: '3',
    description: 'Parallel and distributed computing across cloud, grid, cluster, supercomputer, and many-core systems.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 351 or CS 450',
    prereq: any(c('CS 351'), c('CS 450')),
  },
  {
    code: 'CS 455', title: 'Data Communications', credits: '3',
    description: 'Data communication protocols and interfaces, focused on the lower four layers of the ISO-OSI model.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 450',
    prereq: c('CS 450'),
  },
  {
    code: 'CS 456', title: 'Introduction to Wireless Networks and Performance', credits: '3',
    description: 'A survey of wireless networks of all ranges, including satellite, with their performance and challenges.',
    satisfies: 'CS Technical Elective (T)',
    prereqText: 'CS 350 or ECE 242 CS 401 or CSSP 401 and CS 402 or CSSP 402 or CS 403',
    note: 'The catalog text is missing a word. Stored as: CS 350, or ECE 242, or (CS 401 or CSSP 401) and (CS 402 or CSSP 402), or CS 403.',
    prereq: any(
      c('CS 350'), c('ECE 242'),
      all(any(c('CS 401'), c('CSSP 401')), any(c('CS 402'), c('CSSP 402'))),
      c('CS 403'),
    ),
  },
  {
    code: 'CS 458', title: 'Introduction to Information Security', credits: '3',
    description: 'Computer and information security: defenses against malicious software, encryption, and OS, database, and network security.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 425 or CS 450 or CS 455',
    prereq: any(c('CS 425'), c('CS 450'), c('CS 455')),
  },
  {
    code: 'CS 470', title: 'Computer Architecture', credits: '3',
    description: 'The functional parts of digital computers at the register transfer level: arithmetic, memory, I/O, and instruction processing.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 350 or ECE 242 or CS 402',
    prereq: any(c('CS 350'), c('ECE 242'), c('CS 402')),
  },
  {
    code: 'CS 480', title: 'Introduction to Artificial Intelligence', credits: '3',
    description: 'Methods for controlling autonomous agents: heuristic search, knowledge representation, and probabilistic reasoning.',
    satisfies: '',
    prereqText: `(CS 331 or CS 401 or CSSP 401 with min. grade of S) and (MATH 474* or MATH 475*), ${CONCURRENT_NOTE}`,
    prereq: all(
      any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' })),
      any(c('MATH 474', { concurrent: true }), c('MATH 475', { concurrent: true })),
    ),
  },
  {
    code: 'CS 481', title: 'Artificial Intelligence Language Understanding', credits: '3',
    description: 'Theory and methods that let systems understand human language and pull information out of text.',
    satisfies: '',
    prereqText: `(CS 331 or CS 401 or CSSP 401 with min. grade of S) and (MATH 474* or MATH 475*), ${CONCURRENT_NOTE}`,
    prereq: all(
      any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' })),
      any(c('MATH 474', { concurrent: true }), c('MATH 475', { concurrent: true })),
    ),
  },
  {
    code: 'CS 482', title: 'Information and Knowledge Management Systems', credits: '3',
    description: 'How organizations capture, share, and apply knowledge, plus trends like cloud, AI, and crisis knowledge management.',
    satisfies: 'CS Technical Elective (T)', prereqText: 'CS 429 and CS 425',
    prereq: all(c('CS 429'), c('CS 425')),
  },
  {
    code: 'CS 484', title: 'Introduction to Machine Learning', credits: '3',
    description: 'Machine learning ideas and algorithms: classification, clustering, and regression, including k-means, decision trees, naive Bayes, and neural networks.',
    satisfies: '',
    prereqText: 'MATH 151 or MATH 192 or STAT 225 or BUS 221 or PSYC 203 and CS 116 or CS 201 or CS 401 or ITM 311',
    note: 'The catalog text has no parentheses. Stored as: (MATH 151 or MATH 192 or STAT 225 or BUS 221 or PSYC 203) and (CS 116 or CS 201 or CS 401 or ITM 311).',
    prereq: all(
      any(c('MATH 151'), c('MATH 192'), c('STAT 225'), c('BUS 221'), c('PSYC 203')),
      any(c('CS 116'), c('CS 201'), c('CS 401'), c('ITM 311')),
    ),
  },
  {
    code: 'CS 485', title: 'Computers and Society', credits: '3',
    description: 'How computer technology affects society, past and present, and the social issues it raises.',
    satisfies: 'Communications (C)',
    prereqText: 'COM 421 or COM 424 or COM 425 or COM 428 or COM 435',
    prereq: any(c('COM 421'), c('COM 424'), c('COM 425'), c('COM 428'), c('COM 435')),
  },
  {
    code: 'CS 487', title: 'Software Engineering I', credits: '3',
    description: 'Software engineering principles and practice: quality, process models, requirements, design, testing, and maintenance, with a team project.',
    satisfies: '',
    prereqText: '(CS 331 or CS 401 or CSSP 401 with min. grade of S or CS 403) and CS 425',
    prereq: all(
      any(c('CS 331'), c('CS 401'), c('CSSP 401', { minGrade: 'S' }), c('CS 403')),
      c('CS 425'),
    ),
  },
  {
    code: 'CS 491', title: 'Undergraduate Research', credits: 'Variable',
    description: 'Undergraduate research. Needs instructor permission.',
    satisfies: '', prereqText: 'Instructor permission required.',
    prereq: t('Instructor permission'),
  },
  {
    code: 'CS 492', title: 'Introduction to Computer Science Research', credits: '1',
    description: 'Prepares undergraduate computer science majors to do research.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'CS 495', title: 'Topics in Computer Science', credits: 'Variable',
    description: 'A current computer science topic that changes from semester to semester.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'CS 497', title: 'Special Projects', credits: 'Variable',
    description: 'Special projects.',
    satisfies: '', prereqText: '', prereq: null,
  },

  // ---------- Mathematics (the courses that CS prerequisites point to) ----------
  {
    code: 'MATH 151', title: 'Calculus I', credits: '5',
    description: 'Analytic geometry, limits, derivatives of algebraic and trigonometric functions, and the basics of integrals.',
    satisfies: '',
    prereqText: 'Raw Math score of 80 or MATH 145 with min. grade of C or MATH 148 with min. grade of C',
    prereq: any(t('Raw Math score of 80'), c('MATH 145', { minGrade: 'C' }), c('MATH 148', { minGrade: 'C' })),
  },
  {
    code: 'MATH 152', title: 'Calculus II', credits: '5',
    description: 'Transcendental functions, integration methods, improper integrals, polar coordinates, and series.',
    satisfies: '', prereqText: 'MATH 149 with min. grade of C or MATH 151 with min. grade of C',
    prereq: any(c('MATH 149', { minGrade: 'C' }), c('MATH 151', { minGrade: 'C' })),
  },
  {
    code: 'MATH 230', title: 'Introduction to Discrete Math', credits: '3',
    description: 'Sets, logic, relations, functions, induction, and basic counting.',
    satisfies: '', prereqText: '', prereq: null,
  },
  {
    code: 'MATH 251', title: 'Multivariate and Vector Calculus', credits: '4',
    description: 'Calculus in three dimensions: partial derivatives, multiple integrals, and vector analysis.',
    satisfies: '', prereqText: 'MATH 152',
    prereq: c('MATH 152'),
  },
  {
    code: 'MATH 252', title: 'Introduction to Differential Equations', credits: '4',
    description: 'First- and higher-order linear differential equations, Laplace transforms, and systems.',
    satisfies: '', prereqText: 'MATH 152',
    prereq: c('MATH 152'),
  },
  {
    code: 'MATH 332', title: 'Linear Algebra: Theory and Applications', credits: '3',
    description: 'Matrices, vector spaces, eigenvalues, and orthogonality, with uses like least squares and factorizations.',
    satisfies: '', prereqText: `MATH 251*, ${CONCURRENT_NOTE}`,
    prereq: c('MATH 251', { concurrent: true }),
  },
  {
    code: 'MATH 333', title: 'Matrix Algebra and Complex Variables', credits: '3',
    description: 'Matrix operations, eigenvalues, and linear systems, plus complex analysis such as contour integrals and residues.',
    satisfies: '', prereqText: 'MATH 251',
    prereq: c('MATH 251'),
  },
  {
    code: 'MATH 474', title: 'Probability and Statistics', credits: '3',
    description: 'Probability distributions, estimation, hypothesis tests, confidence intervals, and linear regression.',
    satisfies: '', prereqText: 'MATH 251 or Graduate standing',
    prereq: any(c('MATH 251'), t('Graduate standing')),
  },
  {
    code: 'MATH 475', title: 'Probability', credits: '3',
    description: 'Probability theory, random variables, joint distributions, limit theorems, and simulation.',
    satisfies: '', prereqText: 'MATH 251 or Graduate standing',
    prereq: any(c('MATH 251'), t('Graduate standing')),
  },
];

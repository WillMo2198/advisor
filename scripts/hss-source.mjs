// Humanities and Social Sciences (H&SS) undergraduate courses, for data/catalog.json.
// Source: catalog.iit.edu/courses/{hum,hist,phil,lit,aah,psyc,soc,ps,econ,ssci}, read October 2026.
// Descriptions are short paraphrases. `prereqText` is the catalog wording; `prereq` is the same rule as a tree.
// Only undergraduate courses (under 500) are listed. Graduate and TA-seminar courses are left out.
// Run `npm run build:data` after you edit this file.
//
// Row: [code, title, credits, attributes, description, prereqText, prereq]
// Attribute letters: C = Communications, H = Humanities, S = Social Sciences, E = Ethics, N = Natural Science.

const c = (code, opts = {}) => ({ type: 'course', code, ...opts });
const any = (...children) => ({ type: 'or', children });
const all = (...children) => ({ type: 'and', children });
const t = (text) => ({ type: 'text', text });

const ATTRS = { C: 'Communications (C)', H: 'Humanities (H)', S: 'Social Sciences (S)', E: 'Ethics (E)', N: 'Natural Science (N)' };

// ----- shared prerequisite rules -----
const NONE = ['', null];

const BWPR = ["Satisfaction of IIT's Basic Writing Proficiency Requirement", t("Basic Writing Proficiency Requirement")];

const HUM_INTRO = [100, 102, 104, 106, 108, 180];
const HUM_GATE = [
  'HUM 100, 102, 104, 106, 108, or 180, or any HUM 200-299 course',
  any(...HUM_INTRO.map((n) => c(`HUM ${n}`)), t('Any HUM 200-299 course')),
];
const HUM_GATE_CONCURRENT = [
  'HUM 100, 102, 104, 106, 108, or 180, or any HUM 200-299 course (may be taken concurrently)',
  any(...HUM_INTRO.map((n) => c(`HUM ${n}`, { concurrent: true })), t('Any HUM 200-299 course (may be taken at the same time)')),
];
const HUM_200 = ['Any HUM 200-299 course', t('Any HUM 200-299 course')];

const PLACEMENT = 'IIT Communication Placement score of 102, or qualifying ACT, SAT, or writing test scores';
const COM_OR_PLACEMENT = [
  `COM 101, COM 111, ${PLACEMENT}`,
  any(c('COM 101'), c('COM 111'), t(PLACEMENT)),
];

const GRAD = t('Graduate standing');
const P221_OR_GRAD = ['PSYC 221 or Graduate standing', any(c('PSYC 221'), GRAD)];
const PERMISSION = ['Instructor permission required', t('Instructor permission required')];
const UPPER_PAIR = (s) => [
  `${s} 300-399 and ${s} 190-299`,
  all(t(`Any ${s} 300-399 course`), t(`Any ${s} 190-299 course`)),
];

const rows = [
  // ---------- HUM: Humanities ----------
  ['HUM 100', 'Reading Methods for the Humanities', '3', 'CH', 'Critical reading of scholarly and literary sources for student-chosen research topics. Covers library resources and bibliographic methods. Topics vary by instructor, and off-campus visits may be required.', ...BWPR],
  ['HUM 102', 'Industrial Culture', '3', 'CH', 'How modern industrial society developed, and how science and technology shaped culture, using history, literature, and philosophy.', `${PLACEMENT.replace('IIT Communication Placement score of 102, or', 'IIT Communication Placement score of 102, COM 111, COM 101, or')}`, any(c('COM 111'), c('COM 101'), t(PLACEMENT))],
  ['HUM 103', 'Decoding & Designing Texts with Data', '3', 'CH', 'How engineering, design, and technology relate to ethics, public media, and writing. Covers reading data-driven texts, basic data visualization, and arguing from data to professional and public audiences.', ...BWPR],
  ['HUM 104', 'Age of Darwin', '3', 'CH', "Introduces the humanities by tracing cultural change linked to Darwin's theory of evolution, with readings from literature, philosophy, and science.", ...COM_OR_PLACEMENT],
  ['HUM 106', 'Life Stories', '3', 'CH', "Interdisciplinary study of mostly American autobiographies as a genre, and of the historical and philosophical forces behind the writers' lives. Syllabi vary and may feature figures such as Franklin, Angelou, and Malcolm X.", ...COM_OR_PLACEMENT],
  ['HUM 108', 'Digital Culture', '3', 'CH', 'Major topics in digital culture, including the technical and cultural history of the internet, with academic writing and humanities research methods.', ...BWPR],
  ['HUM 180', 'Topics in Humanities', '3', 'CH', 'First-time or one-time offerings of topics equal to HUM 202, 204, 206, and 208. Introduces the humanities at IIT with intensive writing instruction.', ...BWPR],
  ['HUM 202', 'From Industrial Culture to Artificial Intelligence', '3', 'CH', 'Extends the study of industrial society and its cultural effects from the late eighteenth century to today, using interdisciplinary readings. Writing-intensive.', ...HUM_GATE],
  ['HUM 204', 'Age of Darwin', '3', 'CH', "Cultural change tied to Darwin's evolutionary theory, through literature, philosophy, and science. Writing-intensive.", 'COM 101, COM 111, or IIT Communication Placement score of 102', any(c('COM 101'), c('COM 111'), t('IIT Communication Placement score of 102'))],
  ['HUM 206', 'Life Stories', '3', 'CH', "Interdisciplinary study of biographies and autobiographies as a genre, and of the historical and philosophical contexts of their subjects' lives. Writing-intensive.", 'COM 101, COM 111, or IIT Communication Placement score of 102', any(c('COM 101'), c('COM 111'), t('IIT Communication Placement score of 102'))],
  ['HUM 380', 'Seminar in Humanities', '3', 'CH', 'A current or long-standing humanities topic that does not fit standard categories.', ...HUM_GATE],
  ['HUM 395', 'Practical Experience in Humanities', '3', '', 'Pairs humanities coursework with supervised work in the public or private sector, such as a teaching role or research assistantship. Required for humanities majors. Double majors may submit a five-page report on an equal experience in their other major.', ...HUM_GATE],
  ['HUM 491', 'Independent Reading/Research', 'Variable', 'CH', 'Independent reading or research under faculty direction.', ...HUM_GATE],
  ['HUM 495', 'Foundational Research Methods', '3', 'CH', 'Research methods and current scholarship for advanced humanities students. Students run self-designed research projects and aim to write a draft article for a humanities journal.', ...NONE],

  // ---------- HIST: History ----------
  ['HIST 101', 'World Civilizations to 1500', '3', 'H', 'Major civilizations from prehistory to 1500 across Eurasia, Africa, and the Americas: river civilizations, trade, states and empires, and major religions.', ...BWPR],
  ['HIST 103', 'World Civilizations Since 1500', '3', 'H', 'The making of the modern world through global geopolitical, social, and economic ties, from colonization and the Columbian Exchange to world wars, decolonization, and the 21st century.', ...BWPR],
  ['HIST 104', 'Western Civilization to 1500', '3', 'H', 'Western history to 1500, from early states in Mesopotamia, Greece, and Rome through medieval Europe, the Crusades, the Black Death, and the Renaissance.', ...BWPR],
  ['HIST 105', 'Western Civilization Since 1500', '3', 'H', 'Western history from 1500: the Reformation, the Scientific Revolution, the Enlightenment, revolutions, nationalism, imperialism, the world wars, the Cold War, and decolonization.', ...BWPR],
  ['HIST 106', 'History of the United States to 1877', '3', 'H', 'U.S. history to 1877: colonization, the Revolution, the Constitution, the early republic, slavery, the Civil War, and Reconstruction.', ...BWPR],
  ['HIST 107', 'History of the United States Since 1877', '3', 'CH', 'How the U.S. gained economic and military power and used it at home and abroad, from the Gilded Age through the world wars, Civil Rights, and the early 2000s.', ...NONE],
  ['HIST 252', 'History of Chicago', '3', 'CH', 'Urban institutions in historical context, with Chicago as a case study: political machines, reform movements, planning agencies, ethnic neighborhoods, and organized crime.', ...HUM_GATE],
  ['HIST 253', 'Prohibition Era in Chicago, 1920-1933', '3', 'CH', "The people, places, institutions, politics, and culture of Chicago during federal Prohibition, and the factors that shaped the city's experience.", ...HUM_GATE],
  ['HIST 254', 'Chicago LGBTQ History', '3', 'CH', 'How LGBTQ narratives, cultures, and organizations developed in Chicago, within local, national, and international history.', ...HUM_GATE],
  ['HIST 271', 'A History of Artificial Intelligence from Turing to the Present', '3', 'CH', 'AI from the mid-20th century to today: technical developments, the philosophy behind AI, and its cultural, economic, and environmental effects.', ...HUM_GATE],
  ['HIST 273', 'History of Video Games', 'Variable', 'CH', 'The technical and cultural history of video games, with scholarly writing and humanities research methods.', ...HUM_GATE],
  ['HIST 280', 'Topics in History', '3', 'CH', 'A history topic or period of lasting interest, announced by the instructor when scheduled (for example the Middle Ages, the Ancient Mediterranean, or a history of China).', 'HUM 180 or HUM 102-108', any(c('HUM 180'), c('HUM 102'), c('HUM 103'), c('HUM 104'), c('HUM 106'), c('HUM 108'))],
  ['HIST 380', 'Seminar in History', '3', 'CH', 'A topic of current or lasting historical interest, announced by the instructor when scheduled.', ...HUM_GATE],
  ['HIST 491', 'Independent Reading and Research', 'Variable', 'CH', 'Independent reading and research for advanced students. Needs department consent.', ...HUM_GATE],

  // ---------- PHIL: Philosophy ----------
  ['PHIL 204', 'Judgment and Decision-Making', '3', 'CH', 'Good reasoning, the psychology and philosophy of judgment errors and biases, their effects on people and societies, and ways to improve judgment.', ...HUM_GATE],
  ['PHIL 206', 'Rationality and Science Policy', '3', 'CH', 'Evidence-based look at science policy problems such as group polarization, conspiracy theories, and deference to experts, and the reasoning skills citizens and officials need.', ...HUM_GATE],
  ['PHIL 208', 'Philosophy and Psychology of Language', '3', 'CH', 'Evidence on the nature and origins of language from philosophical and psychological angles: animal communication, reference, meaning, and the biology of language.', ...HUM_GATE],
  ['PHIL 211', 'Influential Thinkers', '3', '', 'In-depth study of one outstanding philosopher, chosen by the instructor.', ...HUM_GATE],
  ['PHIL 235', 'Introduction to Philosophy', '3', 'E', 'Philosophical questions about the mind and its assumptions across philosophy, psychology, neuroscience, and AI, and the relation between minds, bodies, and machines.', ...BWPR],
  ['PHIL 257', 'Philosophy of Medicine', '3', 'CH', 'Health, disease, and illness, and related philosophical and policy issues: clinical trial evidence, bias in care, AI in medicine, disability, and mental illness.', 'HUM 200-299 (may be taken concurrently)', t('Any HUM 200-299 course (may be taken at the same time)')],
  ['PHIL 260', 'Ethics', '3', 'CH', 'Fundamental issues in moral philosophy.', ...HUM_GATE],
  ['PHIL 272', 'Ethics of Technology and Communication', '3', 'CEH', 'Ethical questions about technology and communication: algorithmic bias, privacy and surveillance, consent and manipulation, and digital environmental impact, using case studies.', ...HUM_GATE],
  ['PHIL 280', 'Topics in Philosophy', '3', '', 'A current philosophical topic announced by the instructor when scheduled.', ...HUM_GATE],
  ['PHIL 281', 'Artificial Intelligence, Philosophy and Ethics', '3', 'CH', 'Ethical arguments and principles in AI and robotics: algorithmic bias, machine sentience, self-driving car decision rules, and the moral and legal status of robots.', ...HUM_GATE],
  ['PHIL 282', 'Bioethics', '3', 'CEH', 'Ethical and social issues in life sciences and biomedicine, such as gene editing, stem cells, neurotechnology, human enhancement, and climate change, with an introduction to ethical theory.', ...HUM_GATE],
  ['PHIL 285', 'Trustworthy AI', '3', 'CEH', 'Ethical aspects of AI, focused on trustworthy AI principles such as autonomy, harm prevention, fairness, explainability, privacy, and accountability, judged through use cases.', ...HUM_GATE],
  ['PHIL 330', 'Philosophy of Data Science', '3', 'CH', "Philosophical questions about data, such as what data is and how it works as evidence, plus ethical issues like privacy, algorithmic bias, and computing's environmental impact.", ...HUM_GATE],
  ['PHIL 331', 'Political Philosophy of Artificial Intelligence', '3', 'CEH', 'Applies social contract theories to AI: algorithmic nudging and bias, expertise and chatbots, online platform politics, and digital surveillance.', ...HUM_GATE_CONCURRENT],
  ['PHIL 342', 'Philosophy of Mind', '3', 'CH', 'The concept of mind as distinct from body, and what it means for psychology, AI, and neuroscience.', ...HUM_GATE],
  ['PHIL 380', 'Seminar in Philosophy', '3', 'CH', 'A current philosophical topic announced by the instructor when scheduled.', ...HUM_GATE],
  ['PHIL 491', 'Independent Study', 'Variable', 'H', 'Supervised individual research for advanced students. Needs instructor permission.', ...HUM_GATE],

  // ---------- LIT: Literature ----------
  ['LIT 207', 'Graphic Novel', '3', 'CH', 'How comics moved beyond superhero stories after the 1970s to take on philosophical themes. Works by major and outside creators, plus comics theory. Not for credit to students who took LIT 380 Graphic Novel.', ...HUM_GATE],
  ['LIT 211', 'Influential Authors', '3', '', 'The work of one influential author, chosen by the instructor. Examples include Tolkien, Garcia Marquez, and N. K. Jemisin.', ...HUM_GATE],
  ['LIT 280', 'Topics in Literature', '3', 'CH', 'A current or lasting literary topic set by the instructor. Examples include fantasy history, Victorian literature, and Realism.', 'HUM 180 or HUM 100-110', any(...[100, 102, 103, 104, 106, 108, 180].map((n) => c(`HUM ${n}`)))],
  ['LIT 380', 'Seminar in Literature', '3', 'CH', 'A literary topic of current or lasting interest, announced by the instructor when scheduled.', ...HUM_GATE],
  ['LIT 411', 'Workshop in Creative Writing', '3', 'CH', "Writing fiction, poetry, or drama from a writer's view. Analyzes modern works and workshops student manuscripts.", ...HUM_GATE],
  ['LIT 491', 'Independent Reading and Research', 'Variable', 'H', 'Advanced independent study. Needs department consent.', ...HUM_GATE],

  // ---------- AAH: Art and Architecture History ----------
  ['AAH 119', 'History of World Architecture I', '3', 'CH', 'Architecture worldwide from antiquity through the medieval period, focused on specific cultures and architects alongside broader theories and strategies.', ...BWPR],
  ['AAH 120', 'History of World Architecture II', 'Variable', 'CH', 'Architecture worldwide from the Renaissance to the present, focused on specific cultures and architects alongside broader theories and strategies.', ...BWPR],
  ['AAH 201', 'Art Appreciation: Thinking, Talking, and Writing about Art', '3', 'CH', 'Skills for describing, analyzing, and arguing about painting, sculpture, printmaking, and architecture. Covers art-historical methods, race and identity in interpretation, and how art is exhibited, using Chicago-area institutions.', ...BWPR],
  ['AAH 380', 'Topics in Art and Architecture History', '3', 'CH', 'A current or long-standing topic in art or architectural history, announced by the instructor when scheduled.', ...HUM_GATE],
  ['AAH 491', 'Independent Reading and Research', 'Variable', 'H', 'Independent reading and research for advanced students. Needs instructor permission.', ...HUM_GATE],

  // ---------- PSYC: Psychology ----------
  ['PSYC 100', 'Introduction to the Profession', '3', 'C', 'Overview of psychology concepts, academic career planning, information literacy, communication, and professional skills.', ...NONE],
  ['PSYC 102', 'Introduction to Recovery Support', '2', '', 'Foundations of recovery philosophy, empowerment, listening skills, service planning, advocacy, and mentorship.', ...NONE],
  ['PSYC 103', 'Ethical and Professional Issues in Recovery Support', '2', 'E', 'Historical, philosophical, ethical, and legal issues in recovery support, with ethical decision-making and multicultural competence.', ...NONE],
  ['PSYC 104', 'Evidence-Based Practices in Recovery Support', '2', '', 'Evidence-based practices in mental health and substance use treatment, such as motivational interviewing and supported employment.', ...NONE],
  ['PSYC 105', 'Special Topics and Populations in Recovery Support', '2', '', 'Running peer groups and meeting the needs of special populations and topics like spirituality, sexuality, and telehealth.', ...NONE],
  ['PSYC 106', 'Recovery Support Internship', '1', '', 'Supervised community internship of at least 300 clock hours, with weekly individual and group supervision.', 'PSYC 102, 103, 104, and 105', all(c('PSYC 102'), c('PSYC 103'), c('PSYC 104'), c('PSYC 105'))],
  ['PSYC 121', 'Introduction to Psychology', '3', 'CS', 'Survey of psychological science, research methods, major subfields, and psychological theory applied to mass media.', ...NONE],
  ['PSYC 150', 'Introduction to Leadership: Concepts and Practices', '3', 'CS', 'Historical and current leadership theories, applied to practical leadership experiences.', ...NONE],
  ['PSYC 199', 'Topics in Psychological Science', '3', '', 'Entry-level course using accessible sources to introduce major topics in current psychology. Used for transfer credit.', ...NONE],
  ['PSYC 203', 'Undergraduate Statistics for the Behavioral Sciences', '4', '', 'Statistics for behavioral science: descriptive statistics, ANOVA, regression, correlation, and meta-analysis.', ...NONE],
  ['PSYC 204', 'Research Methods in Behavioral Science', '4', 'CN', 'Experimental, survey, and field methods: ethics, research design, data collection and analysis, and report writing.', '(PSYC 221 or PSYC 222) and PSYC 203', all(any(c('PSYC 221'), c('PSYC 222')), c('PSYC 203'))],
  ['PSYC 210', 'Social Psychology', '3', 'CS', 'How social conditions shape behavior and experience: social issues, human relations, prejudice, and leadership.', ...NONE],
  ['PSYC 211', 'Industrial Psychology', '3', 'CS', 'Practical psychology applied to business and industry: work attitudes, selection, morale, safety, turnover, and training.', ...NONE],
  ['PSYC 212', 'Introduction to Psychopathology', '3', 'CS', 'Cognitive, emotional, and behavioral disorders, with focus on diagnosis, causes, treatment, and research views.', ...NONE],
  ['PSYC 238', 'Professional Skills', '3', '', 'Applied skills in oral communication, conflict management, and interpersonal dynamics at work.', ...NONE],
  ['PSYC 312', 'Human Motivation and Emotion', '3', 'CS', 'Major historical and current motivation theories, and their use in health care, sports, management, education, and gaming.', 'PSYC 221', c('PSYC 221')],
  ['PSYC 320', 'Applied Correlation and Regression', '3', '', 'Applying correlation and regression to research on human behavior, with practical issues, analysis, and reporting of results.', 'PSYC 203', c('PSYC 203')],
  ['PSYC 330', 'Health Psychology', '3', 'CS', 'Psychological principles in health promotion, illness prevention, and treatment, including stress, coping, and specific diseases.', 'PSYC 221', c('PSYC 221')],
  ['PSYC 340', 'Psychology of Gender', '3', 'CS', 'Psychological research on gender: stereotypes, socialization, sexuality, work, violence, and links with other identities.', 'PSYC 221 with min. grade of C', c('PSYC 221', { minGrade: 'C' })],
  ['PSYC 345', 'Human Sexuality', '3', 'CS', 'Sexual health and diversity: sexual response, gender identity, LGBT health, reproductive rights, and sexual communication.', ...NONE],
  ['PSYC 350', 'Prejudice and Stigma', '3', 'CS', 'A social psychology view of how identities are stigmatized, the costs of prejudice, and research on reducing it.', 'PSYC 221', c('PSYC 221')],
  ['PSYC 352', 'Personality Theory', '3', 'S', 'Overview of the main approaches to personality psychology.', ...NONE],
  ['PSYC 355', 'Cross-Cultural Psychology', '3', 'S', 'Cultural influences on psychological phenomena, including cross-cultural communication, workplace diversity, and national traits.', 'PSYC 221', c('PSYC 221')],
  ['PSYC 360', 'Clinical Psychology: Assessment and Treatment', '3', 'CS', 'Psychological testing, psychotherapy, and the work and trends of clinical psychologists.', 'PSYC 303*, An asterisk (*) designates a course which may be taken concurrently.', c('PSYC 303', { concurrent: true })],
  ['PSYC 362', 'Human-Computer Interaction and Web Design', '3', '', 'User-centered design methods such as usability testing and prototyping, applied to usable websites. Co-listed as ITMD 362.', 'ITMD 361', c('ITMD 361')],
  ['PSYC 363', 'Introduction to Sports Psychology', '3', 'S', 'Psychological theories of sport and exercise: motivation, coaching, team dynamics, and performance strategies.', ...NONE],
  ['PSYC 370', 'Health and Safety at Work', '3', 'S', 'Occupational health psychology: how work organization affects employee health, stress, and well-being.', ...NONE],
  ['PSYC 380', 'Topics in Psychology', '3', 'CS', 'A current psychology topic, announced by the instructor when scheduled.', ...NONE],
  ['PSYC 381', 'Topics in Psychology', '3', 'CS', 'A current psychology topic, announced by the instructor when scheduled.', 'PSYC 221 or PSYC 301 or PSYC 303 or PSYC 310', any(c('PSYC 221'), c('PSYC 301'), c('PSYC 303'), c('PSYC 310'))],
  ['PSYC 409', 'Psychological Testing', '3', '', 'Test development, testing techniques, and test use in education, organizations, and clinics, including scale construction.', 'PSYC 203 or PSYC 221 or PSYC 301, or Graduate standing', any(c('PSYC 203'), c('PSYC 221'), c('PSYC 301'), GRAD)],
  ['PSYC 410', 'Introduction to Rehabilitation and Mental Health Counseling', '3', 'CS', 'Historical, ethical, and legal foundations of rehabilitation and mental health counseling, including professional roles and service delivery.', ...P221_OR_GRAD],
  ['PSYC 411', 'Medical Aspects of Disabling Conditions', '3', 'N', 'Human organ systems and medical terms, with disabling conditions and their job and rehabilitation effects. First of two courses.', ...P221_OR_GRAD],
  ['PSYC 412', 'Multicultural and Psychosocial Issues in Rehabilitation and Mental Health Counseling', '3', 'CS', 'Diversity issues in counseling, including culture, disability, gender, aging, and social justice, plus the psychosocial effects of disability.', ...P221_OR_GRAD],
  ['PSYC 414', 'Neural and Biological Bases of Behavior', '3', 'N', 'The biology of behavior, with emphasis on neuroanatomy and neurophysiology of the sensory and central nervous systems.', ...P221_OR_GRAD],
  ['PSYC 423', 'Learning Theory', '3', 'CS', 'Theories of learning: functionalist, associationist, cognitive, social, and neurophysiological views.', ...P221_OR_GRAD],
  ['PSYC 426', 'Cognitive Science', '3', 'S', 'How the mind works, drawing on psychology, computer science, linguistics, neuroscience, and economics.', ...P221_OR_GRAD],
  ['PSYC 435', 'Child Development', '3', 'S', 'Biological and behavioral change in development, including developmental milestones and mechanisms of change.', ...P221_OR_GRAD],
  ['PSYC 436', 'Adult Development', '3', 'S', 'Changes in thinking, social life, physical function, and emotion across adulthood.', '(PSYC 221 and PSYC 303) or PSYC 301 or PSYC 310, or Graduate standing', any(all(c('PSYC 221'), c('PSYC 303')), c('PSYC 301'), c('PSYC 310'), GRAD)],
  ['PSYC 449', 'Practicum in Rehabilitation Services', '3', '', 'Seminar and supervised fieldwork in a rehabilitation setting: service delivery, interviewing, and caseload management.', 'SOC 480, PSYC 412 (may be taken concurrently), PSYC 411, and PSYC 410', all(c('SOC 480'), c('PSYC 412', { concurrent: true }), c('PSYC 411'), c('PSYC 410'))],
  ['PSYC 450', 'Diversity, Equity and Inclusion at Work', '3', '', 'The science and practice of DEI in organizations, with a project to assess a workplace issue and design an intervention.', 'PSYC 301 or PSYC 310, or Graduate standing', any(c('PSYC 301'), c('PSYC 310'), GRAD)],
  ['PSYC 455', 'Development and Evaluation of Training in Organizations', '3', 'S', 'A systems view of organizational training: needs assessment, program design, transfer, and evaluation.', 'PSYC 221 or PSYC 301, or Graduate standing', any(c('PSYC 221'), c('PSYC 301'), GRAD)],
  ['PSYC 456', 'Engineering Psychology', '3', 'S', 'Human abilities in relation to designing transportation, workplace, and other systems, including human-machine interaction and safety.', ...P221_OR_GRAD],
  ['PSYC 460', 'Child and Adolescent Disorders', '3', 'S', 'Major disorders of infancy, childhood, and adolescence, using a developmental psychopathology approach.', 'PSYC 303', c('PSYC 303')],
  ['PSYC 462', 'Behavior Design & User Testing', '3', '', 'Applying behavioral science to technology design, with early consumer testing and lean testing methods.', ...NONE],
  ['PSYC 465', 'Behavior Change Principles and Practice', '3', 'CS', 'Theories and techniques for behavior change, including stages of change, motivational interviewing, and contingency management.', 'PSYC 303', c('PSYC 303')],
  ['PSYC 481', 'Groups and Leadership at Work', '3', 'S', 'A systems model of groups, group development stages, and leadership approaches, with activities on team member and leader roles.', '(PSYC 221 and PSYC 301), or Graduate standing', any(all(c('PSYC 221'), c('PSYC 301')), GRAD)],
  ['PSYC 482', 'Undergraduate Research Seminar I', '3', '', 'Applied psychology research: review of current issues and work in faculty research programs.', '(PSYC 221 and PSYC 204), or Graduate standing', any(all(c('PSYC 221'), c('PSYC 204')), GRAD)],
  ['PSYC 483', 'Undergraduate Research Seminar II', '3', '', 'Continues applied psychology research: review of current issues and work in faculty research programs.', '(PSYC 221, PSYC 222, and PSYC 204), or Graduate standing', any(all(c('PSYC 221'), c('PSYC 222'), c('PSYC 204')), GRAD)],
  ['PSYC 485', 'Senior Capstone Project I', '3', '', 'Independent capstone project, which may include research, a literature review, data analysis, or an internship, guided by an advisor.', ...NONE],
  ['PSYC 486', 'Senior Capstone Project II', '3', '', 'Continues the independent capstone project, with set deliverables such as a thesis or poster.', ...NONE],
  ['PSYC 487', 'Integrative Psychology Seminar I', '3', '', 'Synthesis of issues and areas in psychology.', 'PSYC 203 or Graduate standing; requires 21 credit hours in psychology', all(any(c('PSYC 203'), GRAD), t('21 credit hours in psychology'))],
  ['PSYC 488', 'Integrative Psychology Seminar II', '3', '', 'Brings together key and current research and ideas on major issues in psychology.', 'Requires 24 credit hours in psychology', t('24 credit hours in psychology')],
  ['PSYC 489', 'Undergraduate Psychology Seminar', '3', 'S', 'Reports and discussion of current problems and issues in psychology.', '(PSYC 221 and PSYC 204), or Graduate standing', any(all(c('PSYC 221'), c('PSYC 204')), GRAD)],
  ['PSYC 497', 'Special Problems', 'Variable', '', 'Independent study that gathers and analyzes data on a significant problem. About 3 hours per week per credit.', ...PERMISSION],
  ['PSYC 498', 'Advanced Research', '3', '', 'Advanced research for BSMP students.', ...NONE],

  // ---------- PS: Political Science ----------
  ['PS 114', 'State and Local Government', '3', 'CS', 'How federal, state, regional, and local governments relate: federalism theory, constitutional basis, courts, administration, and current debates.', ...NONE],
  ['PS 130', 'International Relations', '3', 'CS', 'Major theories for understanding global issues such as war, peace, security, human rights, political economy, development, and international organizations.', ...NONE],
  ['PS 132', 'Democracy, Dictatorship, and Development', '3', 'CS', 'Comparative political analysis, applied to instability, conflict, and transitions to stable democracy.', ...NONE],
  ['PS 142', 'American Foreign Policy', '3', '', 'How U.S. foreign policy is made, why it matters at home and abroad, and how its goals and carrying-out can be critiqued.', ...NONE],
  ['PS 180', 'American Government', '3', 'CS', 'U.S. politics: how parties and interest groups link to institutions like the presidency and Congress, and how political culture shapes policy.', ...NONE],
  ['PS 185', 'Special Topics in Political Science', '3', 'CS', 'Introductory course on a current topic announced by the instructor. Repeatable if the topic changes.', ...NONE],
  ['PS 213', 'Comparative Public Policy', '3', 'CS', 'Why policies on welfare, health, education, and immigration differ across countries: culture, economics, institutions, and social organization.', ...HUM_GATE],
  ['PS 217', 'Chicago Politics', '3', 'CS', "Chicago's government past and present, with focus on the Democratic machine, its opponents, and the roles of class, ethnicity, race, and ideology.", ...HUM_GATE],
  ['PS 229', 'Environmental Politics and Policy', '3', 'CS', 'How environmental policy is made and carried out from local to global levels, including conflicts over climate change, pollution, and conservation.', ...HUM_GATE],
  ['PS 233', 'Politics of Science and Technology', '3', 'CS', 'Links among science, technology, and politics, including scientific advice to government and the social effects of technological change.', ...HUM_GATE],
  ['PS 238', 'Energy Policy', '3', 'CS', 'Fossil fuel dependence and government efforts to conserve energy and develop alternatives, weighing economic, political, and environmental effects.', ...NONE],
  ['PS 251', 'Public Administration', '3', 'CS', 'Administrative organization, decision-making, and structures, and the roles of government executives, fiscal procedures, and personnel management.', ...HUM_GATE],
  ['PS 254', 'Urban Policy', '3', '', 'Urban challenges such as economic change, fiscal strain, and marginalized groups, and how politicians and citizens respond. Also listed as SOC 354.', ...HUM_GATE],
  ['PS 260', 'Global Political Economy', '3', 'CS', 'Economic, political, and cultural sides of globalization and international development.', ...HUM_GATE],
  ['PS 272', 'Government and Politics in Africa', '3', 'CS', 'Current African politics in historical, economic, and cultural context, using country cases and regional issues.', ...HUM_GATE],
  ['PS 274', 'East Asian Political Economy', '3', '', 'Current East Asian politics in historical, economic, and cultural context, using country cases and regional issues.', ...HUM_GATE],
  ['PS 284', 'Topics in Political Science', '3', 'CS', 'A current political science topic set by the instructor when scheduled.', ...NONE],
  ['PS 288', 'International Law and Organizations', '3', 'CS', 'Global governance through political science and legal lenses, comparing frameworks such as those of the U.S., ICC, WTO, EU, and NAFTA.', ...HUM_GATE],
  ['PS 491', 'Undergraduate Research in Political Science', '3', 'C', 'Students choose a topic with a faculty member and finish an original, independent research project.', ...UPPER_PAIR('PS')],
  ['PS 497', 'Directed Readings in Political Science', 'Variable', 'CS', 'Independent reading and analysis on specific problems, supervised by a political science faculty member. Up to 3 credits.', ...UPPER_PAIR('PS')],

  // ---------- ECON: Economics ----------
  ['ECON 151', 'Microeconomics', '3', 'S', 'Models of firm and consumer behavior: supply and demand, market structures, efficiency, public goods, externalities, and game theory.', ...NONE],
  ['ECON 152', 'Macroeconomics', '3', 'ES', 'The AD-AS model, national income, growth, money, banking, and international economics, with focus on inflation, unemployment, and monetary and fiscal policy.', ...NONE],
  ['ECON 211', 'Introduction to Economics', '3', 'S', 'Output, employment, and inflation, plus debates over fiscal and monetary policy, budget deficits, exchange rates, and trade deficits. Not open to business or economics majors or minors.', ...NONE],
  ['ECON 251', 'Introduction to Econometrics', '3', 'S', 'Regression analysis theory and use, including panel data, instrumental variables, experiments, misspecification, nonlinear models, and big data.', 'BUS 221 or PSYC 203', any(c('BUS 221'), c('PSYC 203'))],
  ['ECON 311', 'Intermediate Microeconomics', '3', 'S', 'Calculus-based models of price setting, consumer and producer theory, competitive and monopolistic markets, general equilibrium, and game theory.', 'ECON 211 or ECON 151', any(c('ECON 211'), c('ECON 151'))],
  ['ECON 312', 'Intermediate Macroeconomics', '3', 'S', 'Aggregate economic measurement and open-economy equilibrium, short- and long-run views of business cycles, growth, unemployment, and money, and policy options.', 'BUS 221 or (PSYC 203 and ECON 152) or ECON 211', any(c('BUS 221'), all(c('PSYC 203'), c('ECON 152')), c('ECON 211'))],
  ['ECON 382', 'Business Economics', '3', 'S', 'Microeconomic analysis and industrial organization, market conditions and forces, and why governments step into and regulate markets.', 'ECON 151 or ECON 211', any(c('ECON 151'), c('ECON 211'))],
  ['ECON 383', 'Sports Economics', '3', 'S', 'Budgeting and financing for teams, leagues, and venues, plus topics like esports, social media, and diversity, equity, and inclusion, with guest speakers and projects.', ...NONE],
  ['ECON 391', 'Upper-Level Social Science', '3', 'S', 'An upper-level social science course. The catalog gives no further description.', ...NONE],
  ['ECON 392', 'Upper-Level Social Science', '3', 'S', 'An upper-level social science course. The catalog gives no further description.', ...NONE],
  ['ECON 423', 'Economics of Capital Investments', '3', 'S', 'Values capital projects in the public and private sectors with NPV, equivalent uniform benefit/cost, and IRR, with taxes, inflation, risk, and capital rationing. Business students may use it in place of BUS 351 with advisor approval.', ...NONE],

  // ---------- SOC: Sociology ----------
  ['SOC 108', 'Social Psychology and Society', '3', 'CS', 'Everyday judgments and their harmful social effects: the Fundamental Attribution Error, group influence, persuasion, brainwashing, helping behavior, and prejudice. Formerly SOC 308.', ...NONE],
  ['SOC 111', 'Introduction to the Sociology of Space', '3', 'CS', 'How space and spatial layouts shape people, social interaction, and community, up to city planning. Introduces basic sociological concepts and methods. Required for SOC 311.', ...NONE],
  ['SOC 180', 'Introduction to Sociology', '3', 'CS', 'How society is structured and works, how individual behavior is analyzed, with emphasis on social problems.', ...NONE],
  ['SOC 185', 'Introductory Special Topics in Sociology', '3', 'CS', 'A currently relevant topic at an introductory level, announced by the instructor when scheduled. Repeatable if the topic differs.', ...NONE],
  ['SOC 201', 'The Social Dimension of Science', '3', 'CS', "How social and psychological factors affect scientists' reasoning and behavior, set against the traditional view of science. Covers hype, resistance to discovery, controversy, competition, error, and fraud.", ...HUM_GATE],
  ['SOC 202', 'Science and Belief', '3', '', 'Compares Western science with other belief systems, religion, and pseudo-science, and looks at cultural and ideological influences on scientific knowledge and public trust.', ...HUM_GATE],
  ['SOC 205', 'Social Communication', '3', 'CS', 'Verbal and nonverbal communication in personal, professional, and public life, and how to resolve misunderstandings. Covers interpersonal and group interaction, teamwork, leadership, and intercultural communication.', ...HUM_GATE],
  ['SOC 206', 'Science in Society', '3', 'CS', 'Science as an institution, its knowledge, and its practitioners in society, focused on how science shapes and is shaped by political, economic, and cultural contexts.', ...NONE],
  ['SOC 213', 'Social Use of Space', '3', 'CS', "How people experience space and how spatial arrangements affect behavior. Compares planners' and users' ideas and argues for including users in spatial design.", ...NONE],
  ['SOC 248', 'Deviant Behavior and Conformity', '3', 'CS', 'How deviant behavior is defined, develops, and is controlled. Covers societal reactions and the patterns of deviance such as addiction, suicide, crime, and alcoholism.', ...HUM_GATE],
  ['SOC 262', 'Technology and Social Change', '3', 'CS', 'Social effects of new and cutting-edge technologies, with short- and long-term results seen through moral, ethical, socioeconomic, and educational views. Same as PS 362.', ...HUM_GATE],
  ['SOC 286', 'Topics in Sociology', '3', 'CS', 'A current sociology topic announced by the instructor when scheduled.', ...HUM_GATE],
  ['SOC 312', 'Medical Sociology', '3', 'CS', 'Sociological views of medicine, health, and illness: how social, economic, and political forces shape health ideas and medical science, including healthcare politics, inequality, medical technology, and the experience of illness.', ...NONE],
  ['SOC 491', 'Undergraduate Research in Sociology', 'Variable', 'C', 'Students pick a topic with a sociology faculty member, do research, and finish an original independent project.', ...UPPER_PAIR('SOC')],
  ['SOC 497', 'Directed Readings', 'Variable', 'CS', 'Independent reading or analysis on specific problems, supervised by a sociology faculty member. Up to 3 credits.', ...UPPER_PAIR('SOC')],

  // ---------- SSCI: Social Sciences ----------
  ['SSCI 100', 'Introduction to the Profession', '3', 'CS', 'Social science careers and the skills professionals use in the field.', ...NONE],
  ['SSCI 104', 'States, Markets, and Society', '3', 'CS', 'How governments, societies, and the global economy relate, including industrial change, technology, and welfare.', ...NONE],
  ['SSCI 106', 'Introduction to Public Policy', '3', 'CS', 'Policy processes, mainly in the U.S. with some cross-country comparison, models, and policy-area analysis.', ...NONE],
  ['SSCI 120', 'Global Chicago', '3', 'CS', 'How Chicago became a global city and what that did to government, business, education, nonprofits, and immigrants, with field trips.', ...NONE],
  ['SSCI 184', 'Special Topics', '3', 'CS', 'Introductory course on a current topic. Repeatable if the topic differs.', ...NONE],
  ['SSCI 185', 'Introductory Special Topics in Social Sciences', '3', '', 'Introductory special topics course on a current social science subject, announced at scheduling.', ...NONE],
  ['SSCI 209', 'Social Science Research Methods', '3', 'CS', 'Explanation in social science and qualitative and quantitative methods, including research design, measurement, surveys, and sampling.', ...NONE],
  ['SSCI 210', 'Social and Political Thought', '3', 'CS', 'Major social and political theories on individuals and society, conflict, harmony, equality, and the state.', ...NONE],
  ['SSCI 218', 'Global Health', '3', 'CS', 'Multidisciplinary overview of global health history, determinants, major diseases, governance, and health inequality.', ...HUM_200],
  ['SSCI 221', 'Social Inequality', '3', 'CS', 'Social, economic, and political inequality in the U.S. and other societies, its causes, and its results.', ...NONE],
  ['SSCI 223', 'Problems of Multi-Ethnic, Multi-Religious States', '3', '', 'Political challenges, including conflict and fragmentation, in diverse societies in developed and developing countries.', ...HUM_200],
  ['SSCI 225', 'Introduction to Geographic Information Systems', '3', 'CS', 'Geographic data management, data models, basic spatial analysis, and GIS uses, through hands-on exercises.', ...NONE],
  ['SSCI 242', 'Criminal Justice Policy', '3', 'CS', 'U.S. crime control policy, how social science informs it, and how inequality has shaped it.', ...NONE],
  ['SSCI 245', 'AI and Public Policy', '3', 'E', 'AI uses, regulation, and social results, through theory and case studies.', ...NONE],
  ['SSCI 254', 'Urban Policy', '3', 'CS', 'City challenges such as fiscal stress, immigration, and marginalized groups, and how officials respond with policy.', ...HUM_200],
  ['SSCI 255', 'Regional Economic Development', '3', 'CS', 'Why regions differ economically and how they respond to policy and economic change, using models and metrics.', ...NONE],
  ['SSCI 257', 'Race and Public Policy', '3', 'CS', 'How racial inequality has shaped U.S. policy and the justice system in areas such as housing, education, and employment.', ...NONE],
  ['SSCI 276', 'Global Migration', '3', 'CS', 'Migration history and current conditions across regions, including admission policies and immigrant integration.', ...HUM_200],
  ['SSCI 278', 'Innovation Policy', '3', 'CS', 'Government efforts to promote innovation, including R&D roles, green R&D, patents, and international collaboration.', ...PERMISSION],
  ['SSCI 280', 'International Development', '3', 'CS', 'Multidisciplinary development theories, stakeholders, and issues like aid, sustainability, and migration, with policy evaluation.', ...HUM_200],
  ['SSCI 281', 'Computational Social Science', '3', '', 'Computational and agent-based models of inequality, conflict, and segregation. Students extend a model for research.', ...HUM_200],
  ['SSCI 286', 'Qualitative Social Science Research Methods', '3', 'CS', 'Qualitative methods such as interviews, ethnography, and grounded theory, with applied workshops.', ...HUM_200],
  ['SSCI 287', 'Fieldwork Methods', '3', 'CS', 'Work on a real-world project in the field.', ...NONE],
  ['SSCI 288', 'Methods of Economic Impact Analysis', '3', 'CS', 'Input-output and social accounting methods to measure how environmental and social policy affects economies.', ...HUM_200],
  ['SSCI 289', 'Urban Planning Analysis', '3', 'CS', 'Methods for gathering and judging empirical data to assess urban planning responses.', ...HUM_200],
  ['SSCI 325', 'Intermediate Geographic Information Systems', '3', 'CS', 'GIS spatial modeling skills, including raster and vector models, map algebra, surface, and network analysis.', 'SSCI 225 or DS 151-261 or CS 104-201 or PSYC 203', any(c('SSCI 225'), t('Any DS 151-261 course'), t('Any CS 104-201 course'), c('PSYC 203'))],
  ['SSCI 385', 'Special Topics', '3', 'CS', 'An interdisciplinary current social science topic. Repeatable if the topic differs.', ...HUM_200],
  ['SSCI 480', 'Introduction to Survey Methodology', '3', 'CS', 'Survey research design principles, including forming research questions and testable hypotheses.', ...NONE],
  ['SSCI 486', 'Program Evaluation', '3', 'CH', 'Applied methods that public and nonprofit managers use to judge how well services are delivered.', 'SSCI 300-399 or PS 300-399 or SOC 300-399', any(t('Any SSCI 300-399 course'), t('Any PS 300-399 course'), t('Any SOC 300-399 course'))],
  ['SSCI 491', 'Directed UG Research', '3', 'C', 'Independent research project on the spatial spread of economic activity, with an instructor-approved topic.', ...NONE],
  ['SSCI 492', 'Social Sciences Colloquium', '1', 'CS', 'Talks by invited scientists on social science research, to support academic and professional preparation.', ...NONE],
  ['SSCI 493', 'Public Service Internship', '3', '', 'A 120-hour internship at an approved organization that links classroom theory to practice.', ...PERMISSION],
];

export const hssDepartments = {
  HUM: 'Humanities',
  HIST: 'History',
  PHIL: 'Philosophy',
  LIT: 'Literature',
  AAH: 'Art and Architecture History',
  PSYC: 'Psychology',
  PS: 'Political Science',
  ECON: 'Economics',
  SOC: 'Sociology',
  SSCI: 'Social Sciences',
};

export const hssCourses = rows.map(([code, title, credits, attrs, description, prereqText, prereq]) => ({
  code,
  title,
  credits,
  description,
  satisfies: [...attrs].map((a) => ATTRS[a]).join(', '),
  prereqText,
  prereq,
}));

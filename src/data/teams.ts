export type BowlType = 'fast' | 'fastMedium' | 'offspin' | 'legspin';
export type Hand = 'R' | 'L';
export type Competition = 'International' | 'PSL' | 'IPL' | 'BBL';

export interface Player {
  name: string;
  /** 0–100 batting skill: timing, shot choice and power. */
  batting: number;
  /** Batting hand. */
  hand: Hand;
  bowl?: BowlType;
  /** 0–100 bowling skill: accuracy and variation. */
  bowling?: number;
  keeper?: boolean;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  competition: Competition;
  shirt: number;
  trousers: number;
  trim: number;
  helmet: number;
  /** Batting order. */
  players: Player[];
}

/**
 * One squad row: [name, batting rating, batting hand] for a batter,
 * add 'wk' for the wicket-keeper, or a bowling type and rating for a bowler.
 * Left-arm orthodox spinners are listed as 'legspin' because their stock ball
 * turns away from a right-hander, and left-arm wrist spinners as 'offspin'.
 */
type Row = [string, number, Hand] | [string, number, Hand, 'wk'] | [string, number, Hand, BowlType, number];

type Kit = [shirt: number, trousers: number, trim: number, helmet: number];

function team(id: string, name: string, short: string, competition: Competition, kit: Kit, rows: Row[]): Team {
  const [shirt, trousers, trim, helmet] = kit;
  const players = rows.map(([name, batting, hand, bowl, bowling]): Player => {
    if (bowl === 'wk') return { name, batting, hand, keeper: true };
    return bowl ? { name, batting, hand, bowl, bowling } : { name, batting, hand };
  });
  return { id, name, short, competition, shirt, trousers, trim, helmet, players };
}

// Squads are approximate and for private, educational use only (see plan.md §7).
// Edit freely: order is the batting order, and every side needs at least one
// pace bowler and one spinner for the two overs.

// ---------------------------------------------------------------- International

export const PAKISTAN = team('pak', 'Pakistan', 'PAK', 'International', [0x0f7a3d, 0x0b5c2e, 0xc8f05a, 0x0d5a2c], [
  ['Ahmad', 74, 'R'],
  ['Saim Ayub', 78, 'L', 'offspin', 50],
  ['Babar Azam', 84, 'R'],
  ['Mohammad Rizwan', 80, 'R', 'wk'],
  ['Fakhar Zaman', 80, 'L'],
  ['Salman Ali Agha', 72, 'R', 'offspin', 60],
  ['Shadab Khan', 62, 'R', 'legspin', 75],
  ['Shaheen Shah Afridi', 35, 'L', 'fast', 90],
  ['Naseem Shah', 22, 'R', 'fast', 86],
  ['Haris Rauf', 15, 'R', 'fast', 82],
  ['Abrar Ahmed', 8, 'R', 'legspin', 80],
]);

export const INDIA = team('ind', 'India', 'IND', 'International', [0x1d4fa3, 0x14306b, 0xff8c1a, 0x13274f], [
  ['Abhishek Sharma', 82, 'L', 'legspin', 45],
  ['Shubman Gill', 82, 'R'],
  ['Suryakumar Yadav', 86, 'R'],
  ['Tilak Varma', 80, 'L'],
  ['Sanju Samson', 76, 'R', 'wk'],
  ['Hardik Pandya', 78, 'R', 'fastMedium', 74],
  ['Rinku Singh', 78, 'L'],
  ['Axar Patel', 66, 'L', 'legspin', 80],
  ['Kuldeep Yadav', 25, 'L', 'offspin', 86],
  ['Jasprit Bumrah', 20, 'R', 'fast', 95],
  ['Arshdeep Singh', 22, 'L', 'fastMedium', 85],
]);

export const AUSTRALIA = team('aus', 'Australia', 'AUS', 'International', [0xf3c517, 0x0e5a3a, 0x0e5a3a, 0x0e5a3a], [
  ['Travis Head', 86, 'L', 'offspin', 45],
  ['Mitchell Marsh', 80, 'R', 'fastMedium', 65],
  ['Steve Smith', 78, 'R'],
  ['Glenn Maxwell', 80, 'R', 'offspin', 70],
  ['Marcus Stoinis', 76, 'R', 'fastMedium', 68],
  ['Tim David', 78, 'R'],
  ['Josh Inglis', 76, 'R', 'wk'],
  ['Pat Cummins', 45, 'R', 'fast', 90],
  ['Mitchell Starc', 35, 'L', 'fast', 88],
  ['Adam Zampa', 15, 'R', 'legspin', 86],
  ['Josh Hazlewood', 10, 'L', 'fastMedium', 89],
]);

export const ENGLAND = team('eng', 'England', 'ENG', 'International', [0x2a4fa0, 0x14214a, 0xd71920, 0x111c3d], [
  ['Phil Salt', 82, 'R'],
  ['Jos Buttler', 86, 'R', 'wk'],
  ['Harry Brook', 84, 'R'],
  ['Ben Duckett', 78, 'L'],
  ['Liam Livingstone', 76, 'R', 'legspin', 60],
  ['Jacob Bethell', 72, 'L', 'legspin', 60],
  ['Sam Curran', 66, 'L', 'fastMedium', 74],
  ['Jofra Archer', 30, 'R', 'fast', 88],
  ['Adil Rashid', 30, 'R', 'legspin', 84],
  ['Mark Wood', 22, 'R', 'fast', 85],
  ['Saqib Mahmood', 18, 'R', 'fastMedium', 78],
]);

export const NEW_ZEALAND = team('nz', 'New Zealand', 'NZ', 'International', [0x1a1a1a, 0x111111, 0x8fd14f, 0x151515], [
  ['Finn Allen', 76, 'R'],
  ['Devon Conway', 80, 'L', 'wk'],
  ['Rachin Ravindra', 78, 'L', 'legspin', 62],
  ['Kane Williamson', 84, 'R', 'offspin', 35],
  ['Daryl Mitchell', 78, 'R', 'fastMedium', 45],
  ['Glenn Phillips', 78, 'R', 'offspin', 62],
  ['Michael Bracewell', 60, 'L', 'offspin', 68],
  ['Mitchell Santner', 55, 'L', 'legspin', 82],
  ['Matt Henry', 22, 'R', 'fastMedium', 82],
  ['Lockie Ferguson', 20, 'R', 'fast', 84],
  ['Trent Boult', 18, 'R', 'fastMedium', 86],
]);

export const SOUTH_AFRICA = team('sa', 'South Africa', 'SA', 'International', [0x0b6b3a, 0x0a4a2a, 0xffc61a, 0x0a4a2a], [
  ['Quinton de Kock', 84, 'L', 'wk'],
  ['Reeza Hendricks', 74, 'R'],
  ['Aiden Markram', 82, 'R', 'offspin', 55],
  ['Heinrich Klaasen', 86, 'R'],
  ['David Miller', 82, 'L'],
  ['Tristan Stubbs', 76, 'R'],
  ['Marco Jansen', 58, 'L', 'fast', 82],
  ['Keshav Maharaj', 30, 'R', 'legspin', 80],
  ['Kagiso Rabada', 30, 'L', 'fast', 88],
  ['Anrich Nortje', 15, 'R', 'fast', 84],
  ['Tabraiz Shamsi', 10, 'R', 'offspin', 80],
]);

export const SRI_LANKA = team('sl', 'Sri Lanka', 'SL', 'International', [0x1e40a0, 0x14285e, 0xf5c518, 0x14285e], [
  ['Pathum Nissanka', 80, 'R'],
  ['Kusal Mendis', 78, 'R', 'wk'],
  ['Kusal Perera', 74, 'L'],
  ['Charith Asalanka', 76, 'L', 'offspin', 45],
  ['Kamindu Mendis', 74, 'L', 'offspin', 50],
  ['Dasun Shanaka', 66, 'R', 'fastMedium', 62],
  ['Wanindu Hasaranga', 58, 'R', 'legspin', 88],
  ['Maheesh Theekshana', 25, 'R', 'offspin', 82],
  ['Dushmantha Chameera', 20, 'R', 'fast', 80],
  ['Matheesha Pathirana', 10, 'R', 'fast', 82],
  ['Nuwan Thushara', 10, 'R', 'fastMedium', 76],
]);

export const BANGLADESH = team('ban', 'Bangladesh', 'BAN', 'International', [0x006a4e, 0x004a36, 0xd8202f, 0x004a36], [
  ['Litton Das', 74, 'R', 'wk'],
  ['Tanzid Hasan', 70, 'L'],
  ['Najmul Hossain Shanto', 72, 'L'],
  ['Towhid Hridoy', 72, 'R'],
  ['Shakib Al Hasan', 76, 'L', 'legspin', 80],
  ['Mahmudullah', 70, 'R', 'offspin', 50],
  ['Jaker Ali', 64, 'R'],
  ['Mehidy Hasan Miraz', 60, 'R', 'offspin', 74],
  ['Rishad Hossain', 30, 'R', 'legspin', 74],
  ['Taskin Ahmed', 18, 'L', 'fast', 80],
  ['Mustafizur Rahman', 10, 'L', 'fastMedium', 82],
]);

export const AFGHANISTAN = team('afg', 'Afghanistan', 'AFG', 'International', [0x1f4fbf, 0x13306e, 0xd8202f, 0x13306e], [
  ['Rahmanullah Gurbaz', 78, 'R', 'wk'],
  ['Ibrahim Zadran', 76, 'R'],
  ['Azmatullah Omarzai', 66, 'R', 'fastMedium', 74],
  ['Gulbadin Naib', 62, 'R', 'fastMedium', 60],
  ['Najibullah Zadran', 68, 'L'],
  ['Mohammad Nabi', 66, 'R', 'offspin', 76],
  ['Karim Janat', 58, 'R', 'fastMedium', 60],
  ['Rashid Khan', 50, 'R', 'legspin', 94],
  ['Noor Ahmad', 15, 'L', 'offspin', 82],
  ['Naveen-ul-Haq', 18, 'R', 'fastMedium', 80],
  ['Fazalhaq Farooqi', 10, 'R', 'fastMedium', 82],
]);

export const WEST_INDIES = team('wi', 'West Indies', 'WI', 'International', [0x7a1a2b, 0x4d1019, 0xf2c230, 0x4d1019], [
  ['Brandon King', 74, 'R'],
  ['Shai Hope', 78, 'R', 'wk'],
  ['Nicholas Pooran', 84, 'L'],
  ['Shimron Hetmyer', 74, 'L'],
  ['Rovman Powell', 74, 'R'],
  ['Sherfane Rutherford', 70, 'L'],
  ['Andre Russell', 76, 'R', 'fast', 74],
  ['Romario Shepherd', 58, 'R', 'fastMedium', 72],
  ['Akeal Hosein', 30, 'L', 'legspin', 80],
  ['Alzarri Joseph', 25, 'R', 'fast', 82],
  ['Gudakesh Motie', 20, 'L', 'legspin', 76],
]);

export const IRELAND = team('ire', 'Ireland', 'IRE', 'International', [0x18a058, 0x0f6b3b, 0x1b2a4a, 0x1b2a4a], [
  ['Paul Stirling', 76, 'R', 'offspin', 40],
  ['Andrew Balbirnie', 70, 'R'],
  ['Harry Tector', 74, 'R'],
  ['Lorcan Tucker', 70, 'R', 'wk'],
  ['Curtis Campher', 64, 'R', 'fastMedium', 62],
  ['George Dockrell', 60, 'L', 'legspin', 64],
  ['Gareth Delany', 62, 'R', 'legspin', 66],
  ['Mark Adair', 50, 'R', 'fastMedium', 74],
  ['Barry McCarthy', 30, 'R', 'fastMedium', 70],
  ['Josh Little', 15, 'R', 'fastMedium', 80],
  ['Ben White', 10, 'R', 'legspin', 66],
]);

export const ZIMBABWE = team('zim', 'Zimbabwe', 'ZIM', 'International', [0xc8202b, 0x7a1219, 0xf2c230, 0x1a1a1a], [
  ['Brian Bennett', 70, 'R'],
  ['Tadiwanashe Marumani', 66, 'L'],
  ['Clive Madande', 60, 'R', 'wk'],
  ['Sikandar Raza', 78, 'R', 'offspin', 74],
  ['Sean Williams', 70, 'L', 'legspin', 60],
  ['Ryan Burl', 68, 'L', 'legspin', 62],
  ['Dion Myers', 62, 'R'],
  ['Wessly Madhevere', 64, 'R', 'offspin', 50],
  ['Wellington Masakadza', 30, 'L', 'legspin', 70],
  ['Richard Ngarava', 15, 'L', 'fastMedium', 74],
  ['Blessing Muzarabani', 15, 'R', 'fast', 78],
]);

// ---------------------------------------------------------------- PSL

export const LAHORE_QALANDARS = team('lq', 'Lahore Qalandars', 'LQ', 'PSL', [0x1c9a4a, 0x0f5c2b, 0xe0242b, 0x0f5c2b], [
  ['Fakhar Zaman', 80, 'L'],
  ['Abdullah Shafique', 70, 'R'],
  ['Mohammad Naeem', 66, 'R'],
  ['Daryl Mitchell', 78, 'R', 'fastMedium', 45],
  ['Sam Billings', 72, 'R', 'wk'],
  ['Sikandar Raza', 78, 'R', 'offspin', 74],
  ['David Wiese', 66, 'R', 'fastMedium', 66],
  ['Shaheen Shah Afridi', 35, 'L', 'fast', 90],
  ['Rishad Hossain', 30, 'R', 'legspin', 74],
  ['Haris Rauf', 15, 'R', 'fast', 82],
  ['Zaman Khan', 10, 'R', 'fast', 78],
]);

export const KARACHI_KINGS = team('kk', 'Karachi Kings', 'KK', 'PSL', [0x1a3fae, 0x0f246a, 0xe0242b, 0x0f246a], [
  ['David Warner', 82, 'L'],
  ['Tim Seifert', 74, 'R', 'wk'],
  ['James Vince', 78, 'R'],
  ['Shan Masood', 72, 'L'],
  ['Khushdil Shah', 70, 'L', 'legspin', 50],
  ['Irfan Khan Niazi', 66, 'R'],
  ['Mohammad Nabi', 66, 'R', 'offspin', 76],
  ['Hasan Ali', 30, 'R', 'fast', 78],
  ['Abbas Afridi', 25, 'R', 'fastMedium', 76],
  ['Adam Milne', 20, 'R', 'fast', 80],
  ['Mir Hamza', 10, 'L', 'fastMedium', 74],
]);

export const ISLAMABAD_UNITED = team('iu', 'Islamabad United', 'IU', 'PSL', [0xd62128, 0x1a1a1a, 0xf0f0f0, 0xb01a20], [
  ['Sahibzada Farhan', 74, 'R'],
  ['Colin Munro', 74, 'L'],
  ['Andries Gous', 70, 'R'],
  ['Salman Ali Agha', 72, 'R', 'offspin', 60],
  ['Azam Khan', 68, 'R', 'wk'],
  ['Haider Ali', 66, 'R'],
  ['Shadab Khan', 62, 'R', 'legspin', 78],
  ['Imad Wasim', 62, 'L', 'legspin', 74],
  ['Jason Holder', 60, 'R', 'fastMedium', 76],
  ['Ben Dwarshuis', 30, 'L', 'fastMedium', 74],
  ['Naseem Shah', 20, 'R', 'fast', 84],
]);

export const MULTAN_SULTANS = team('ms', 'Multan Sultans', 'MS', 'PSL', [0x1e9e8f, 0x0d5c54, 0xf2c230, 0x0d5c54], [
  ['Mohammad Rizwan', 80, 'R', 'wk'],
  ['Usman Khan', 72, 'R'],
  ['Yasir Khan', 66, 'R'],
  ['Kamran Ghulam', 66, 'R'],
  ['Iftikhar Ahmed', 68, 'R', 'offspin', 55],
  ['Michael Bracewell', 60, 'L', 'offspin', 68],
  ['David Willey', 58, 'L', 'fastMedium', 74],
  ['Chris Jordan', 45, 'R', 'fast', 76],
  ['Usama Mir', 30, 'R', 'legspin', 76],
  ['Ubaid Shah', 15, 'R', 'fast', 76],
  ['Akif Javed', 10, 'R', 'fastMedium', 72],
]);

export const PESHAWAR_ZALMI = team('pz', 'Peshawar Zalmi', 'PZ', 'PSL', [0xf6c20f, 0x1a1a1a, 0x1a1a1a, 0x1a1a1a], [
  ['Saim Ayub', 78, 'L', 'offspin', 50],
  ['Babar Azam', 84, 'R'],
  ['Mohammad Haris', 68, 'R', 'wk'],
  ['Tom Kohler-Cadmore', 70, 'R'],
  ['Mitchell Owen', 72, 'R', 'fastMedium', 50],
  ['Hussain Talat', 64, 'L', 'fastMedium', 55],
  ['Maaz Sadaqat', 60, 'L', 'legspin', 50],
  ['Luke Wood', 30, 'L', 'fastMedium', 74],
  ['Alzarri Joseph', 25, 'R', 'fast', 82],
  ['Sufiyan Muqeem', 10, 'R', 'offspin', 76],
  ['Mohammad Ali', 10, 'R', 'fastMedium', 72],
]);

export const QUETTA_GLADIATORS = team('qg', 'Quetta Gladiators', 'QG', 'PSL', [0x5b2a86, 0x3a1a57, 0xf2c230, 0x3a1a57], [
  ['Finn Allen', 76, 'R'],
  ['Saud Shakeel', 72, 'L'],
  ['Rilee Rossouw', 76, 'L'],
  ['Kusal Mendis', 76, 'R', 'wk'],
  ['Hasan Nawaz', 68, 'R'],
  ['Faheem Ashraf', 58, 'L', 'fastMedium', 70],
  ['Mohammad Wasim Jr', 40, 'R', 'fast', 72],
  ['Akeal Hosein', 30, 'L', 'legspin', 80],
  ['Mohammad Amir', 30, 'L', 'fastMedium', 82],
  ['Abrar Ahmed', 8, 'R', 'legspin', 80],
  ['Usman Tariq', 10, 'R', 'offspin', 72],
]);

// ---------------------------------------------------------------- IPL

export const CHENNAI = team('csk', 'Chennai Super Kings', 'CSK', 'IPL', [0xfdd521, 0x1b3a8a, 0x1b3a8a, 0x1b3a8a], [
  ['Ruturaj Gaikwad', 80, 'R'],
  ['Devon Conway', 78, 'L'],
  ['Rachin Ravindra', 76, 'L', 'legspin', 60],
  ['Shivam Dube', 76, 'L'],
  ['Ravindra Jadeja', 70, 'L', 'legspin', 82],
  ['MS Dhoni', 72, 'R', 'wk'],
  ['Sam Curran', 66, 'L', 'fastMedium', 72],
  ['Ravichandran Ashwin', 45, 'R', 'offspin', 80],
  ['Noor Ahmad', 15, 'L', 'offspin', 82],
  ['Khaleel Ahmed', 10, 'R', 'fastMedium', 76],
  ['Matheesha Pathirana', 10, 'R', 'fast', 82],
]);

export const MUMBAI = team('mi', 'Mumbai Indians', 'MI', 'IPL', [0x0b4ea2, 0x0a2f63, 0xd4af37, 0x0a2f63], [
  ['Rohit Sharma', 82, 'R'],
  ['Ryan Rickelton', 72, 'L', 'wk'],
  ['Will Jacks', 74, 'R', 'offspin', 60],
  ['Suryakumar Yadav', 86, 'R'],
  ['Tilak Varma', 80, 'L'],
  ['Hardik Pandya', 78, 'R', 'fastMedium', 74],
  ['Naman Dhir', 64, 'R', 'offspin', 40],
  ['Mitchell Santner', 55, 'L', 'legspin', 82],
  ['Deepak Chahar', 35, 'R', 'fastMedium', 76],
  ['Trent Boult', 18, 'R', 'fastMedium', 86],
  ['Jasprit Bumrah', 20, 'R', 'fast', 95],
]);

export const BENGALURU = team('rcb', 'Royal Challengers Bengaluru', 'RCB', 'IPL', [0xc8102e, 0x1a1a1a, 0xd4af37, 0x1a1a1a], [
  ['Virat Kohli', 88, 'R'],
  ['Phil Salt', 82, 'R', 'wk'],
  ['Rajat Patidar', 76, 'R'],
  ['Liam Livingstone', 76, 'R', 'legspin', 60],
  ['Jitesh Sharma', 68, 'R'],
  ['Tim David', 78, 'R'],
  ['Krunal Pandya', 62, 'L', 'legspin', 74],
  ['Romario Shepherd', 58, 'R', 'fastMedium', 70],
  ['Bhuvneshwar Kumar', 30, 'R', 'fastMedium', 80],
  ['Josh Hazlewood', 10, 'L', 'fastMedium', 89],
  ['Suyash Sharma', 5, 'R', 'legspin', 70],
]);

export const KOLKATA = team('kkr', 'Kolkata Knight Riders', 'KKR', 'IPL', [0x3a225d, 0x261640, 0xd4af37, 0x261640], [
  ['Sunil Narine', 70, 'L', 'offspin', 86],
  ['Quinton de Kock', 82, 'L', 'wk'],
  ['Ajinkya Rahane', 74, 'R'],
  ['Venkatesh Iyer', 74, 'L'],
  ['Rinku Singh', 78, 'L'],
  ['Andre Russell', 76, 'R', 'fast', 74],
  ['Ramandeep Singh', 62, 'R', 'fastMedium', 50],
  ['Harshit Rana', 25, 'R', 'fast', 76],
  ['Spencer Johnson', 15, 'L', 'fast', 76],
  ['Vaibhav Arora', 15, 'R', 'fastMedium', 72],
  ['Varun Chakaravarthy', 10, 'R', 'legspin', 84],
]);

export const HYDERABAD = team('srh', 'Sunrisers Hyderabad', 'SRH', 'IPL', [0xf26522, 0x1a1a1a, 0x1a1a1a, 0x1a1a1a], [
  ['Travis Head', 86, 'L', 'offspin', 40],
  ['Abhishek Sharma', 82, 'L', 'legspin', 55],
  ['Ishan Kishan', 76, 'L', 'wk'],
  ['Heinrich Klaasen', 86, 'R'],
  ['Nitish Kumar Reddy', 70, 'R', 'fastMedium', 60],
  ['Aniket Verma', 64, 'R'],
  ['Pat Cummins', 45, 'R', 'fast', 88],
  ['Harshal Patel', 35, 'R', 'fastMedium', 76],
  ['Mohammed Shami', 20, 'R', 'fast', 82],
  ['Jaydev Unadkat', 15, 'L', 'fastMedium', 70],
  ['Zeeshan Ansari', 10, 'R', 'legspin', 66],
]);

export const DELHI = team('dc', 'Delhi Capitals', 'DC', 'IPL', [0x17449b, 0x0d2a63, 0xd71920, 0x0d2a63], [
  ['Faf du Plessis', 76, 'R'],
  ['Abishek Porel', 68, 'L', 'wk'],
  ['KL Rahul', 82, 'R'],
  ['Tristan Stubbs', 76, 'R'],
  ['Axar Patel', 66, 'L', 'legspin', 80],
  ['Ashutosh Sharma', 68, 'R'],
  ['Vipraj Nigam', 40, 'R', 'legspin', 66],
  ['Mitchell Starc', 35, 'L', 'fast', 86],
  ['Kuldeep Yadav', 20, 'L', 'offspin', 86],
  ['Mukesh Kumar', 10, 'R', 'fastMedium', 72],
  ['Mohit Sharma', 10, 'R', 'fastMedium', 70],
]);

export const PUNJAB = team('pbks', 'Punjab Kings', 'PBKS', 'IPL', [0xd71920, 0x8a0f17, 0xc0c0c0, 0xb0131b], [
  ['Prabhsimran Singh', 72, 'R', 'wk'],
  ['Priyansh Arya', 74, 'L'],
  ['Shreyas Iyer', 82, 'R'],
  ['Josh Inglis', 78, 'R'],
  ['Nehal Wadhera', 68, 'L'],
  ['Shashank Singh', 72, 'R'],
  ['Marcus Stoinis', 76, 'R', 'fastMedium', 66],
  ['Azmatullah Omarzai', 66, 'R', 'fastMedium', 72],
  ['Marco Jansen', 58, 'L', 'fast', 80],
  ['Arshdeep Singh', 20, 'L', 'fastMedium', 85],
  ['Yuzvendra Chahal', 5, 'R', 'legspin', 84],
]);

export const RAJASTHAN = team('rr', 'Rajasthan Royals', 'RR', 'IPL', [0xea1a85, 0x254aa5, 0x254aa5, 0x254aa5], [
  ['Yashasvi Jaiswal', 84, 'L'],
  ['Vaibhav Suryavanshi', 72, 'L'],
  ['Sanju Samson', 78, 'R', 'wk'],
  ['Nitish Rana', 70, 'L', 'offspin', 40],
  ['Riyan Parag', 74, 'R', 'legspin', 50],
  ['Dhruv Jurel', 72, 'R'],
  ['Shimron Hetmyer', 74, 'L'],
  ['Wanindu Hasaranga', 56, 'R', 'legspin', 86],
  ['Jofra Archer', 30, 'R', 'fast', 88],
  ['Maheesh Theekshana', 20, 'R', 'offspin', 80],
  ['Sandeep Sharma', 10, 'R', 'fastMedium', 74],
]);

export const GUJARAT = team('gt', 'Gujarat Titans', 'GT', 'IPL', [0x1b2133, 0x12172a, 0xd4af37, 0x12172a], [
  ['Shubman Gill', 84, 'R'],
  ['Sai Sudharsan', 82, 'L'],
  ['Jos Buttler', 86, 'R', 'wk'],
  ['Sherfane Rutherford', 72, 'L'],
  ['Shahrukh Khan', 68, 'R', 'offspin', 35],
  ['Rahul Tewatia', 66, 'L', 'legspin', 50],
  ['Washington Sundar', 60, 'L', 'offspin', 74],
  ['Rashid Khan', 50, 'R', 'legspin', 92],
  ['Sai Kishore', 20, 'L', 'legspin', 76],
  ['Mohammed Siraj', 15, 'R', 'fast', 82],
  ['Prasidh Krishna', 10, 'R', 'fast', 80],
]);

export const LUCKNOW = team('lsg', 'Lucknow Super Giants', 'LSG', 'IPL', [0x2a6fdb, 0x163a7a, 0xf26522, 0x163a7a], [
  ['Aiden Markram', 80, 'R', 'offspin', 50],
  ['Mitchell Marsh', 80, 'R', 'fastMedium', 55],
  ['Nicholas Pooran', 86, 'L'],
  ['Rishabh Pant', 80, 'L', 'wk'],
  ['Ayush Badoni', 70, 'R'],
  ['David Miller', 80, 'L'],
  ['Abdul Samad', 68, 'R'],
  ['Shardul Thakur', 40, 'R', 'fastMedium', 72],
  ['Ravi Bishnoi', 15, 'R', 'legspin', 80],
  ['Avesh Khan', 15, 'R', 'fast', 76],
  ['Digvesh Rathi', 10, 'R', 'legspin', 72],
]);

// ---------------------------------------------------------------- BBL

export const ADELAIDE_STRIKERS = team('str', 'Adelaide Strikers', 'STR', 'BBL', [0x1d6fd1, 0x0e3d7a, 0xf0f0f0, 0x0e3d7a], [
  ['Matt Short', 78, 'R', 'offspin', 55],
  ['Chris Lynn', 76, 'R'],
  ['Jake Weatherald', 72, 'L'],
  ['Alex Ross', 66, 'R'],
  ['Harry Nielsen', 62, 'L', 'wk'],
  ['Jamie Overton', 62, 'R', 'fast', 74],
  ['Liam Scott', 56, 'R', 'fastMedium', 60],
  ['Cameron Boyce', 25, 'R', 'legspin', 72],
  ['Henry Thornton', 10, 'R', 'fastMedium', 72],
  ['Lloyd Pope', 10, 'R', 'legspin', 74],
  ['Jordan Buckingham', 10, 'R', 'fast', 70],
]);

export const BRISBANE_HEAT = team('hea', 'Brisbane Heat', 'HEA', 'BBL', [0x00a3ad, 0x005f66, 0xf05a28, 0x005f66], [
  ['Colin Munro', 74, 'L'],
  ['Josh Brown', 70, 'R'],
  ['Nathan McSweeney', 70, 'R', 'offspin', 45],
  ['Matt Renshaw', 72, 'L', 'offspin', 40],
  ['Max Bryant', 68, 'R'],
  ['Jimmy Peirson', 64, 'R', 'wk'],
  ['Paul Walter', 62, 'R', 'fastMedium', 60],
  ['Michael Neser', 54, 'R', 'fastMedium', 76],
  ['Xavier Bartlett', 30, 'R', 'fastMedium', 76],
  ['Mitchell Swepson', 15, 'R', 'legspin', 74],
  ['Spencer Johnson', 15, 'L', 'fast', 78],
]);

export const HOBART_HURRICANES = team('hur', 'Hobart Hurricanes', 'HUR', 'BBL', [0x6a2c91, 0x431b5c, 0xf0f0f0, 0x431b5c], [
  ['Mitchell Owen', 76, 'R', 'fastMedium', 50],
  ['Caleb Jewell', 70, 'L'],
  ['Ben McDermott', 74, 'R'],
  ['Tim David', 78, 'R'],
  ['Matthew Wade', 72, 'L', 'wk'],
  ['Nikhil Chaudhary', 58, 'R', 'legspin', 64],
  ['Chris Jordan', 46, 'R', 'fast', 74],
  ['Rishad Hossain', 30, 'R', 'legspin', 74],
  ['Nathan Ellis', 25, 'R', 'fast', 80],
  ['Riley Meredith', 10, 'R', 'fast', 78],
  ['Billy Stanlake', 5, 'R', 'fast', 72],
]);

export const MELBOURNE_RENEGADES = team('ren', 'Melbourne Renegades', 'REN', 'BBL', [0xd21f2b, 0x1a1a1a, 0x1a1a1a, 0x1a1a1a], [
  ['Jake Fraser-McGurk', 74, 'R'],
  ['Laurie Evans', 70, 'R'],
  ['Tim Seifert', 72, 'R', 'wk'],
  ['Jordan Cox', 68, 'R'],
  ['Mackenzie Harvey', 66, 'L'],
  ['Jonathan Wells', 64, 'R'],
  ['Will Sutherland', 60, 'R', 'fastMedium', 68],
  ['Tom Rogers', 30, 'L', 'fastMedium', 72],
  ['Adam Zampa', 15, 'R', 'legspin', 86],
  ['Fergus O\'Neill', 10, 'R', 'fastMedium', 70],
  ['Jason Behrendorff', 10, 'R', 'fastMedium', 76],
]);

export const MELBOURNE_STARS = team('sta', 'Melbourne Stars', 'STA', 'BBL', [0x1b9e3e, 0x0d5c22, 0x0d5c22, 0x0d5c22], [
  ['Ben Duckett', 76, 'L'],
  ['Joe Clarke', 70, 'R'],
  ['Glenn Maxwell', 80, 'R', 'offspin', 70],
  ['Marcus Stoinis', 78, 'R', 'fastMedium', 66],
  ['Beau Webster', 70, 'R', 'offspin', 55],
  ['Sam Harper', 68, 'R', 'wk'],
  ['Hilton Cartwright', 64, 'R', 'fastMedium', 50],
  ['Mark Steketee', 30, 'R', 'fastMedium', 72],
  ['Usama Mir', 25, 'R', 'legspin', 76],
  ['Peter Siddle', 15, 'R', 'fastMedium', 70],
  ['Haris Rauf', 15, 'R', 'fast', 82],
]);

export const PERTH_SCORCHERS = team('sco', 'Perth Scorchers', 'SCO', 'BBL', [0xf37021, 0x1a1a1a, 0x1a1a1a, 0x1a1a1a], [
  ['Finn Allen', 76, 'R'],
  ['Josh Inglis', 78, 'R', 'wk'],
  ['Cooper Connolly', 70, 'L', 'legspin', 60],
  ['Ashton Turner', 70, 'R', 'offspin', 40],
  ['Nick Hobson', 64, 'L'],
  ['Aaron Hardie', 66, 'R', 'fastMedium', 66],
  ['Ashton Agar', 56, 'L', 'legspin', 72],
  ['Andrew Tye', 30, 'R', 'fastMedium', 74],
  ['Jhye Richardson', 25, 'R', 'fast', 78],
  ['Lance Morris', 10, 'R', 'fast', 80],
  ['Mahli Beardman', 10, 'R', 'fast', 70],
]);

export const SYDNEY_SIXERS = team('six', 'Sydney Sixers', 'SIX', 'BBL', [0xd6197c, 0x7a0e47, 0xf0f0f0, 0x7a0e47], [
  ['Josh Philippe', 72, 'R', 'wk'],
  ['James Vince', 78, 'R'],
  ['Daniel Hughes', 68, 'L'],
  ['Moises Henriques', 66, 'R', 'fastMedium', 60],
  ['Jordan Silk', 66, 'R'],
  ['Jack Edwards', 60, 'R', 'fastMedium', 62],
  ['Hayden Kerr', 50, 'L', 'fastMedium', 66],
  ['Sean Abbott', 45, 'R', 'fastMedium', 76],
  ['Ben Dwarshuis', 35, 'L', 'fastMedium', 74],
  ['Steve O\'Keefe', 25, 'R', 'legspin', 72],
  ['Todd Murphy', 20, 'L', 'offspin', 74],
]);

export const SYDNEY_THUNDER = team('thu', 'Sydney Thunder', 'THU', 'BBL', [0x9dc83b, 0x2a2a2a, 0x2a2a2a, 0x2a2a2a], [
  ['David Warner', 82, 'L'],
  ['Sam Konstas', 68, 'R'],
  ['Sam Billings', 70, 'R', 'wk'],
  ['Cameron Bancroft', 66, 'R'],
  ['Oliver Davies', 66, 'R'],
  ['Daniel Sams', 56, 'L', 'fastMedium', 72],
  ['Chris Green', 50, 'R', 'offspin', 72],
  ['Tom Andrews', 30, 'L', 'legspin', 66],
  ['Lockie Ferguson', 20, 'R', 'fast', 82],
  ['Tanveer Sangha', 10, 'R', 'legspin', 76],
  ['Wes Agar', 10, 'R', 'fastMedium', 70],
]);

export const TEAMS: Team[] = [
  PAKISTAN, INDIA, AUSTRALIA, ENGLAND, NEW_ZEALAND, SOUTH_AFRICA, SRI_LANKA, BANGLADESH, AFGHANISTAN, WEST_INDIES, IRELAND, ZIMBABWE,
  LAHORE_QALANDARS, KARACHI_KINGS, ISLAMABAD_UNITED, MULTAN_SULTANS, PESHAWAR_ZALMI, QUETTA_GLADIATORS,
  CHENNAI, MUMBAI, BENGALURU, KOLKATA, HYDERABAD, DELHI, PUNJAB, RAJASTHAN, GUJARAT, LUCKNOW,
  ADELAIDE_STRIKERS, BRISBANE_HEAT, HOBART_HURRICANES, MELBOURNE_RENEGADES, MELBOURNE_STARS, PERTH_SCORCHERS, SYDNEY_SIXERS, SYDNEY_THUNDER,
];

export const COMPETITIONS: Competition[] = ['International', 'PSL', 'IPL', 'BBL'];

export const teamById = (id: string) => TEAMS.find((t) => t.id === id) ?? PAKISTAN;
export const teamsIn = (c: Competition) => TEAMS.filter((t) => t.competition === c);

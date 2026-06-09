// IIM Kozhikode Students Bus Timings — w.e.f. 09.06.2026. Same schedule every day.
export interface BusTrip {
  time: string   // display time of departure
  min: number    // minutes since midnight (for "next bus")
  from: string
  to: string[]   // ordered stops after `from`
  maingate: boolean
}

export const BUS_NOTE = 'Bus timings w.e.f. 09 Jun 2026 · same every day.'
export const BUS_STOPS = ['C&D Housing', 'PGP Auditorium', 'Maingate', 'Phase V Campus']

export const BUS: BusTrip[] = [
  { time: '8:55 AM', min: 535, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '9:05 AM', min: 545, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '10:25 AM', min: 625, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '10:35 AM', min: 635, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '10:37 AM', min: 637, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '11:00 AM', min: 660, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '11:45 AM', min: 705, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (11:55 am)', 'PGP Auditorium'], maingate: false },
  { time: '12:05 PM', min: 725, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '12:07 PM', min: 727, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '1:35 PM', min: 815, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '1:38 PM', min: 818, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '1:45 PM', min: 825, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '2:05 PM', min: 845, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (2:10 pm)', 'PGP Auditorium'], maingate: false },
  { time: '2:15 PM', min: 855, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '2:17 PM', min: 857, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '3:00 PM', min: 900, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '3:30 PM', min: 930, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (3:40 pm)', 'PGP Auditorium'], maingate: false },
  { time: '3:50 PM', min: 950, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '3:52 PM', min: 952, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '4:15 PM', min: 975, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '5:00 PM', min: 1020, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (5:10 pm)', 'PGP Auditorium'], maingate: false },
  { time: '5:20 PM', min: 1040, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '5:22 PM', min: 1042, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '6:00 PM', min: 1080, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '6:20 PM', min: 1100, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (6:30 pm)', 'PGP Auditorium'], maingate: false },
  { time: '6:50 PM', min: 1130, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '6:52 PM', min: 1132, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '7:00 PM', min: 1140, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '8:00 PM', min: 1200, from: 'Maingate', to: ['C&D Housing (8:05 pm)', 'Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '8:10 PM', min: 1210, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '8:15 PM', min: 1215, from: 'C&D Housing', to: ['Phase V Campus (8:20 pm)', 'PGP Auditorium'], maingate: false },
  { time: '8:25 PM', min: 1225, from: 'PGP Auditorium', to: ['Phase V Campus (8:30 pm)', 'C&D Housing'], maingate: true },
  { time: '9:00 PM', min: 1260, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (9:10 pm)', 'PGP Auditorium'], maingate: false },
  { time: '9:30 PM', min: 1290, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing & Return to PGP'], maingate: false },
  { time: '9:50 PM', min: 1310, from: 'PGP Auditorium', to: ['Phase V Campus (9:55 pm)', 'C&D Housing'], maingate: true },
  { time: '10:20 PM', min: 1340, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus (10:30 pm)', 'PGP Auditorium'], maingate: false },
  { time: '10:40 PM', min: 1360, from: 'PGP Auditorium', to: ['Phase V Campus (10:45 pm)', 'C&D Housing'], maingate: true },
  { time: '11:00 PM', min: 1380, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '11:20 PM', min: 1400, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing & Return to PGP'], maingate: false },
  { time: '11:40 PM', min: 1420, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '12:00 AM', min: 1440, from: 'Maingate', to: ['C&D Housing', 'Phase V Campus', 'PGP Auditorium'], maingate: false },
]

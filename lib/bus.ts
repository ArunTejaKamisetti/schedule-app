// IIM Kozhikode campus buses. Two fleets, each running the same schedule every day:
//   · student — students bus timings, w.e.f. 09.06.2026
//   · staff   — staff mini bus (shuttle service)
export type BusKind = 'student' | 'staff'

export interface BusTrip {
  time: string   // display time of departure
  min: number    // minutes since midnight (for "next bus")
  from: string
  to: string[]   // ordered stops after `from`
  maingate: boolean // student fleet: the trip carries on to the main gate
  kind: BusKind
}

type RawTrip = Omit<BusTrip, 'kind'>

export const BUS_NOTE = 'Student bus timings w.e.f. 09 Jun 2026 · same every day.'
export const STAFF_BUS_NOTE = 'Staff mini bus (shuttle service) · same every day.'
export const BUS_STOPS = ['C&D Housing', 'PGP Auditorium', 'Main Gate', 'Phase V Campus']
export const STAFF_BUS_STOPS = ['Main Gate', 'Main Office', 'Phase-V Apt', 'Apt 1', 'Resi. Hill']

const STUDENT_TRIPS: RawTrip[] = [
  { time: '8:55 AM', min: 535, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '9:05 AM', min: 545, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '10:25 AM', min: 625, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '10:35 AM', min: 635, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '10:37 AM', min: 637, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '11:00 AM', min: 660, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '11:45 AM', min: 705, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (11:55 am)', 'PGP Auditorium'], maingate: false },
  { time: '12:05 PM', min: 725, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '12:07 PM', min: 727, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '1:35 PM', min: 815, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '1:38 PM', min: 818, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '1:45 PM', min: 825, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '2:05 PM', min: 845, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (2:10 pm)', 'PGP Auditorium'], maingate: false },
  { time: '2:15 PM', min: 855, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '2:17 PM', min: 857, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '3:00 PM', min: 900, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '3:30 PM', min: 930, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (3:40 pm)', 'PGP Auditorium'], maingate: false },
  { time: '3:50 PM', min: 950, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '3:52 PM', min: 952, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '4:15 PM', min: 975, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '5:00 PM', min: 1020, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (5:10 pm)', 'PGP Auditorium'], maingate: false },
  { time: '5:20 PM', min: 1040, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '5:22 PM', min: 1042, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '6:00 PM', min: 1080, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '6:20 PM', min: 1100, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (6:30 pm)', 'PGP Auditorium'], maingate: false },
  { time: '6:50 PM', min: 1130, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '6:52 PM', min: 1132, from: 'C&D Housing', to: ['Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '7:00 PM', min: 1140, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '8:00 PM', min: 1200, from: 'Main Gate', to: ['C&D Housing (8:05 pm)', 'Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '8:10 PM', min: 1210, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: false },
  { time: '8:15 PM', min: 1215, from: 'C&D Housing', to: ['Phase V Campus (8:20 pm)', 'PGP Auditorium'], maingate: false },
  { time: '8:25 PM', min: 1225, from: 'PGP Auditorium', to: ['Phase V Campus (8:30 pm)', 'C&D Housing'], maingate: true },
  { time: '9:00 PM', min: 1260, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (9:10 pm)', 'PGP Auditorium'], maingate: false },
  { time: '9:30 PM', min: 1290, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing & Return to PGP'], maingate: false },
  { time: '9:50 PM', min: 1310, from: 'PGP Auditorium', to: ['Phase V Campus (9:55 pm)', 'C&D Housing'], maingate: true },
  { time: '10:20 PM', min: 1340, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus (10:30 pm)', 'PGP Auditorium'], maingate: false },
  { time: '10:40 PM', min: 1360, from: 'PGP Auditorium', to: ['Phase V Campus (10:45 pm)', 'C&D Housing'], maingate: true },
  { time: '11:00 PM', min: 1380, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus', 'PGP Auditorium'], maingate: false },
  { time: '11:20 PM', min: 1400, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing & Return to PGP'], maingate: false },
  { time: '11:40 PM', min: 1420, from: 'PGP Auditorium', to: ['Phase V Campus', 'C&D Housing'], maingate: true },
  { time: '12:00 AM', min: 1440, from: 'Main Gate', to: ['C&D Housing', 'Phase V Campus', 'PGP Auditorium'], maingate: false },
]

// Staff mini bus. Every trip starts at the Main Gate or the Main Office; `maingate` stays false
// because the main gate is already named explicitly in `from`/`to` here.
const STAFF_TRIPS: RawTrip[] = [
  { time: '7:45 AM', min: 465, from: 'Main Gate', to: ['Main Office (direct)'], maingate: false },
  { time: '8:10 AM', min: 490, from: 'Main Office', to: ['Main Gate'], maingate: false },
  { time: '8:30 AM', min: 510, from: 'Main Gate', to: ['Main Office (direct)'], maingate: false },
  { time: '8:42 AM', min: 522, from: 'Main Office', to: ['Phase-V Apt', 'Resi. Hill & back'], maingate: false },
  { time: '10:15 AM', min: 615, from: 'Main Office', to: ['Phase-V Apt', 'Apt 1', 'Resi. Hill & back'], maingate: false },
  { time: '10:40 AM', min: 640, from: 'Main Office', to: ['Main Gate'], maingate: false },
  { time: '11:50 AM', min: 710, from: 'Main Gate', to: ['Main Office'], maingate: false },
  { time: '1:05 PM', min: 785, from: 'Main Office', to: ['Phase-V Apt', 'Resi. Hill', 'Main Gate'], maingate: false },
  { time: '1:50 PM', min: 830, from: 'Main Gate', to: ['Resi. Hill', 'Phase-V Apt', 'Main Office'], maingate: false },
  { time: '2:30 PM', min: 870, from: 'Main Office', to: ['Apt 1', 'Resi. Hill & back'], maingate: false },
  { time: '3:30 PM', min: 930, from: 'Main Office', to: ['Phase-V Apt', 'Resi. Hill', 'Main Gate'], maingate: false },
  { time: '4:15 PM', min: 975, from: 'Main Gate', to: ['Resi. Hill', 'Phase-V Apt', 'Main Office'], maingate: false },
  { time: '4:45 PM', min: 1005, from: 'Main Office', to: ['Main Gate (direct)'], maingate: false },
  { time: '5:15 PM', min: 1035, from: 'Main Gate', to: ['Main Office'], maingate: false },
  { time: '5:40 PM', min: 1060, from: 'Main Office', to: ['Phase-V Apt', 'Resi. Hill', 'Main Gate'], maingate: false },
  { time: '6:00 PM', min: 1080, from: 'Main Gate', to: ['Main Office'], maingate: false },
  { time: '6:30 PM', min: 1110, from: 'Main Office', to: ['Phase-V Apt', 'Resi. Hill', 'Main Gate'], maingate: false },
  { time: '7:30 PM', min: 1170, from: 'Main Gate', to: ['Resi. Hill', 'Phase-V Apt', 'Main Office'], maingate: false },
  { time: '8:30 PM', min: 1230, from: 'Main Office', to: ['Phase-V Apt', 'Resi. Hill', 'Main Gate'], maingate: false },
  { time: '9:30 PM', min: 1290, from: 'Main Gate', to: ['Phase-V Apt', 'Resi. Hill', 'Main Office'], maingate: false },
  { time: '9:55 PM', min: 1315, from: 'Main Office', to: ['Main Gate'], maingate: false },
]

export const STUDENT_BUS: BusTrip[] = STUDENT_TRIPS.map((t) => ({ ...t, kind: 'student' }))
export const STAFF_BUS: BusTrip[] = STAFF_TRIPS.map((t) => ({ ...t, kind: 'staff' }))
// Both fleets on one timeline. Array#sort is stable, so a student trip leads at equal minutes.
export const ALL_BUS: BusTrip[] = [...STUDENT_BUS, ...STAFF_BUS].sort((a, b) => a.min - b.min)

export type BusFleet = 'all' | BusKind

export const BUS_FLEETS: Record<BusFleet, { label: string; trips: BusTrip[]; note: string }> = {
  all: { label: 'All', trips: ALL_BUS, note: `${BUS_NOTE} ${STAFF_BUS_NOTE}` },
  student: { label: 'Student', trips: STUDENT_BUS, note: BUS_NOTE },
  staff: { label: 'Staff', trips: STAFF_BUS, note: STAFF_BUS_NOTE },
}

// Departure points that actually have trips, in schedule order — drives the "from" filter chips.
export function busOrigins(trips: BusTrip[]): string[] {
  return [...new Set(trips.map((t) => t.from))]
}

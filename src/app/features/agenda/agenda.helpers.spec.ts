import { AgendaAppointment, AgendaLane } from '../../core/models/agenda.models';
import {
  appointmentPlace,
  clockOf,
  closedBands,
  daySummary,
  gridAppointments,
  gridWindow,
  hourMarks,
  longDate,
  minutesOfClock,
  nowMinutes,
  pixelsPerMinute,
  shiftDate,
  todayIn,
} from './agenda.helpers';

const MX = 'America/Mexico_City';

/** Lunes 7-dic-2026 en Ciudad de México (UTC−6): 15:00Z son las 09:00. */
const appointment = (patch: Partial<AgendaAppointment> = {}): AgendaAppointment => ({
  id: 'a1',
  equipmentId: 'e1',
  serviceTypeId: 's1',
  serviceTypeName: 'Tomografía contrastada',
  startsAt: '2026-12-07T15:00:00.000Z',
  endsAt: '2026-12-07T15:15:00.000Z',
  state: 'scheduled',
  priority: 'normal',
  patientName: 'María López',
  patientPhone: null,
  notes: null,
  arrivedAt: null,
  cancelReason: null,
  ...patch,
});

const lane = (patch: Partial<AgendaLane> = {}): AgendaLane => ({
  id: 'e1',
  establishmentId: 'est1',
  name: 'Tomógrafo',
  modality: 'ct',
  room: null,
  timeZone: MX,
  dayStartsAt: '2026-12-07T06:00:00.000Z',
  dayEndsAt: '2026-12-08T06:00:00.000Z',
  hours: [{ opensAt: '08:00', closesAt: '14:00' }],
  blocks: [],
  appointments: [],
  ...patch,
});

describe('fechas de la agenda', () => {
  it('avanza y retrocede días cruzando mes y año', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('«hoy» es la fecha del establecimiento, no la del navegador', () => {
    // 03:00Z del día 8 todavía es la noche del 7 en Ciudad de México.
    expect(todayIn(MX, new Date('2026-12-08T03:00:00.000Z'))).toBe('2026-12-07');
    expect(todayIn('Asia/Tokyo', new Date('2026-12-08T03:00:00.000Z'))).toBe('2026-12-08');
  });

  it('escribe la fecha larga con el día de la semana', () => {
    expect(longDate('2026-12-07')).toBe('Lunes 7 de diciembre de 2026');
  });
});

describe('horas en la zona del equipo', () => {
  it('lee la hora de un instante en la zona del equipo', () => {
    expect(clockOf('2026-12-07T15:00:00.000Z', MX)).toBe('09:00');
    expect(clockOf('2026-12-07T15:00:00.000Z', 'America/Tijuana')).toBe('07:00');
  });

  it('convierte HH:MM a minutos, incluido el cierre a las 24:00', () => {
    expect(minutesOfClock('08:30')).toBe(510);
    expect(minutesOfClock('24:00')).toBe(1440);
  });

  it('la línea de «ahora» solo existe el día de hoy', () => {
    const now = new Date('2026-12-07T16:40:00.000Z');
    expect(nowMinutes(lane(), '2026-12-07', now)).toBe(640);
    expect(nowMinutes(lane(), '2026-12-08', now)).toBeNull();
  });
});

describe('ventana de la parrilla', () => {
  it('cubre el horario de los equipos, a horas completas', () => {
    const lanes = [lane({ hours: [{ opensAt: '08:30', closesAt: '14:00' }] }), lane({ hours: [{ opensAt: '10:00', closesAt: '19:30' }] })];
    expect(gridWindow(lanes)).toEqual({ from: 480, to: 1200 });
  });

  it('se estira para mostrar una urgencia fuera de horario', () => {
    const night = appointment({ startsAt: '2026-12-08T04:00:00.000Z', endsAt: '2026-12-08T04:30:00.000Z', priority: 'urgent' });
    expect(gridWindow([lane({ appointments: [night] })])).toEqual({ from: 480, to: 1380 });
  });

  it('una cita que cruza la medianoche se corta al final del día', () => {
    const late = appointment({ startsAt: '2026-12-08T05:30:00.000Z', endsAt: '2026-12-08T06:30:00.000Z' });
    expect(gridWindow([lane({ appointments: [late] })]).to).toBe(1440);
  });

  it('sin horarios ni citas muestra una jornada de 07:00 a 20:00', () => {
    expect(gridWindow([lane({ hours: [] })])).toEqual({ from: 420, to: 1200 });
  });

  it('marca cada media hora y distingue las horas en punto', () => {
    const marks = hourMarks({ from: 480, to: 570 });
    expect(marks).toEqual([
      { minutes: 480, label: '08:00', onTheHour: true },
      { minutes: 510, label: '08:30', onTheHour: false },
      { minutes: 540, label: '09:00', onTheHour: true },
    ]);
  });
});

describe('escala de la parrilla', () => {
  it('con citas de 5 minutos da a cada una alto para una línea de texto', () => {
    const short = appointment({ endsAt: '2026-12-07T15:05:00.000Z' });
    expect(pixelsPerMinute([lane({ appointments: [short] })]) * 5).toBeGreaterThanOrEqual(22);
  });

  it('con citas largas no se alarga de más ni se aplasta', () => {
    const long = appointment({ endsAt: '2026-12-07T17:00:00.000Z' });
    expect(pixelsPerMinute([lane({ appointments: [long] })])).toBe(1.6);
    expect(pixelsPerMinute([lane()])).toBe(1.6);
  });

  it('coloca una cita según su hora y duración dentro de la ventana', () => {
    expect(appointmentPlace(appointment(), lane(), { from: 480, to: 840 }, 2)).toEqual({ top: 120, height: 30 });
  });
});

describe('horas fuera de servicio', () => {
  it('sombrea lo que queda de la ventana fuera del horario del equipo', () => {
    const split = lane({ hours: [{ opensAt: '08:00', closesAt: '12:00' }, { opensAt: '16:00', closesAt: '18:00' }] });
    expect(closedBands(split, { from: 420, to: 1140 })).toEqual([
      { from: 420, to: 480 },
      { from: 720, to: 960 },
      { from: 1080, to: 1140 },
    ]);
  });

  it('un equipo sin horario ese día queda cerrado completo', () => {
    expect(closedBands(lane({ hours: [] }), { from: 420, to: 1200 })).toEqual([{ from: 420, to: 1200 }]);
  });

  it('un equipo abierto toda la ventana no sombrea nada', () => {
    expect(closedBands(lane({ hours: [{ opensAt: '00:00', closesAt: '24:00' }] }), { from: 420, to: 1200 })).toEqual([]);
  });
});

describe('citas que se pintan', () => {
  it('no pinta las canceladas', () => {
    expect(gridAppointments(lane({ appointments: [appointment({ state: 'cancelled' })] }))).toEqual([]);
  });

  it('pinta a quien no se presentó, salvo que otra cita ya ocupe ese hueco', () => {
    const noShow = appointment({ id: 'n1', state: 'no_show' });
    const replacement = appointment({ id: 'r1', startsAt: '2026-12-07T15:05:00.000Z', endsAt: '2026-12-07T15:20:00.000Z' });
    expect(gridAppointments(lane({ appointments: [noShow] })).map((a) => a.id)).toEqual(['n1']);
    expect(gridAppointments(lane({ appointments: [noShow, replacement] })).map((a) => a.id)).toEqual(['r1']);
  });
});

describe('resumen del día', () => {
  it('cuenta citas vigentes, llegadas, urgentes y ausencias; las canceladas no cuentan', () => {
    const lanes = [
      lane({
        appointments: [
          appointment({ id: '1' }),
          appointment({ id: '2', state: 'arrived', priority: 'urgent' }),
          appointment({ id: '3', state: 'attended' }),
          appointment({ id: '4', state: 'no_show' }),
          appointment({ id: '5', state: 'cancelled', priority: 'urgent' }),
        ],
      }),
    ];
    expect(daySummary(lanes)).toEqual({ total: 4, arrived: 1, attended: 1, urgent: 1, noShow: 1 });
  });
});

export type ProgramId = 'beginner-full-body' | 'ppl' | 'skill-strength' | 'grease-the-groove';

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  target: { reps?: number; seconds?: number };
  restSeconds: number;
}

export interface ProgramSession {
  id: string;
  name: { en: string; it: string };
  day: { en: string; it: string };
  exercises: ProgramExercise[];
}

export interface ProgramTemplate {
  id: ProgramId;
  name: { en: string; it: string };
  summary: { en: string; it: string };
  details: { en: string; it: string };
  frequency: { en: string; it: string };
  sessions: ProgramSession[];
}

const reps = (exerciseId: string, sets: number, target: number, restSeconds = 90): ProgramExercise => ({
  exerciseId, sets, target: { reps: target }, restSeconds,
});
const hold = (exerciseId: string, sets: number, seconds: number, restSeconds = 60): ProgramExercise => ({
  exerciseId, sets, target: { seconds }, restSeconds,
});

export const programTemplates: ProgramTemplate[] = [
  {
    id: 'beginner-full-body',
    name: { en: 'Beginner full body', it: 'Total body per principianti' },
    summary: { en: 'Build a steady base with three balanced sessions each week.', it: 'Costruisci una base solida con tre sessioni equilibrate a settimana.' },
    details: { en: 'Alternate A and B with at least one rest day between sessions. Start with comfortable reps and leave a few in reserve.', it: 'Alterna A e B lasciando almeno un giorno di recupero tra le sessioni. Scegli ripetizioni gestibili e fermati prima del cedimento.' },
    frequency: { en: '3 days / week · alternate A and B', it: '3 giorni / settimana · alterna A e B' },
    sessions: [
      { id: 'a', name: { en: 'Full body A', it: 'Total body A' }, day: { en: 'Monday · Workout A', it: 'Lunedì · Allenamento A' }, exercises: [reps('incline-push-up', 3, 8), reps('inverted-row', 3, 8), reps('bodyweight-squat', 3, 10), hold('plank', 3, 20)] },
      { id: 'b', name: { en: 'Full body B', it: 'Total body B' }, day: { en: 'Wednesday · Workout B', it: 'Mercoledì · Allenamento B' }, exercises: [reps('push-up', 3, 6), reps('band-assisted-pull-up', 3, 5), reps('reverse-lunge', 3, 8), reps('glute-bridge', 3, 10)] },
      { id: 'a2', name: { en: 'Full body A', it: 'Total body A' }, day: { en: 'Friday · Workout A', it: 'Venerdì · Allenamento A' }, exercises: [reps('incline-push-up', 3, 8), reps('inverted-row', 3, 8), reps('bodyweight-squat', 3, 10), hold('plank', 3, 20)] },
    ],
  },
  {
    id: 'ppl',
    name: { en: 'Push / Pull / Legs', it: 'Spinta / Trazione / Gambe' },
    summary: { en: 'A familiar three-way split with a six-day weekly rotation.', it: 'Una suddivisione classica in tre gruppi, con rotazione settimanale di sei giorni.' },
    details: { en: 'Repeat the sequence twice, then take a rest day. Adjust the number of rounds to your recovery and experience.', it: 'Ripeti la sequenza due volte e poi prenditi un giorno di recupero. Adatta il volume al tuo recupero e alla tua esperienza.' },
    frequency: { en: '6 training days / week · 1 rest day', it: '6 giorni di allenamento / settimana · 1 di riposo' },
    sessions: [
      { id: 'push-1', name: { en: 'Push', it: 'Spinta' }, day: { en: 'Monday · Push', it: 'Lunedì · Spinta' }, exercises: [reps('push-up', 4, 8), reps('parallel-bar-dip', 3, 6), reps('pike-push-up', 3, 6)] },
      { id: 'pull-1', name: { en: 'Pull', it: 'Trazione' }, day: { en: 'Tuesday · Pull', it: 'Martedì · Trazione' }, exercises: [reps('pull-up', 4, 5), reps('inverted-row', 4, 8), hold('dead-hang', 3, 30)] },
      { id: 'legs-1', name: { en: 'Legs', it: 'Gambe' }, day: { en: 'Wednesday · Legs', it: 'Mercoledì · Gambe' }, exercises: [reps('bodyweight-squat', 4, 12), reps('split-squat', 3, 8), reps('single-leg-glute-bridge', 3, 10)] },
      { id: 'push-2', name: { en: 'Push', it: 'Spinta' }, day: { en: 'Thursday · Push', it: 'Giovedì · Spinta' }, exercises: [reps('decline-push-up', 4, 8), reps('ring-dip', 3, 6), reps('elevated-pike-push-up', 3, 6)] },
      { id: 'pull-2', name: { en: 'Pull', it: 'Trazione' }, day: { en: 'Friday · Pull', it: 'Venerdì · Trazione' }, exercises: [reps('chin-up', 4, 5), reps('ring-row', 4, 8), reps('hanging-knee-raise', 3, 10)] },
      { id: 'legs-2', name: { en: 'Legs', it: 'Gambe' }, day: { en: 'Saturday · Legs', it: 'Sabato · Gambe' }, exercises: [reps('reverse-lunge', 4, 10), reps('assisted-pistol-squat', 3, 6), reps('hamstring-walkout', 3, 8)] },
    ],
  },
  {
    id: 'skill-strength',
    name: { en: 'Skill + strength', it: 'Skill + forza' },
    summary: { en: 'Practice a calisthenics skill while keeping balanced strength work.', it: 'Allena una skill calistenica mantenendo un lavoro di forza equilibrato.' },
    details: { en: 'Do the skill practice first while fresh. Keep holds controlled and stop before technique breaks down.', it: 'Inizia con la skill quando sei fresco. Mantieni le tenute controllate e fermati prima che la tecnica peggiori.' },
    frequency: { en: '4 days / week · upper and lower body', it: '4 giorni / settimana · parte alta e bassa' },
    sessions: [
      { id: 'upper-a', name: { en: 'Upper A · Handstand', it: 'Parte alta A · Verticale' }, day: { en: 'Monday · Upper A', it: 'Lunedì · Parte alta A' }, exercises: [hold('wall-facing-handstand-hold', 4, 25, 75), reps('pike-push-up-progression', 3, 6), reps('pull-up', 3, 5), reps('push-up', 3, 10)] },
      { id: 'lower-a', name: { en: 'Lower A', it: 'Parte bassa A' }, day: { en: 'Tuesday · Lower A', it: 'Martedì · Parte bassa A' }, exercises: [reps('pistol-squat', 3, 5), reps('nordic-hamstring-curl', 3, 5), reps('calf-raise', 3, 12), hold('hollow-body-hold', 3, 20)] },
      { id: 'upper-b', name: { en: 'Upper B · Front lever', it: 'Parte alta B · Front lever' }, day: { en: 'Thursday · Upper B', it: 'Giovedì · Parte alta B' }, exercises: [hold('tuck-front-lever', 4, 12, 90), reps('parallel-bar-dip', 3, 6), reps('inverted-row', 3, 10), reps('hanging-leg-raise', 3, 8)] },
      { id: 'lower-b', name: { en: 'Lower B', it: 'Parte bassa B' }, day: { en: 'Saturday · Lower B', it: 'Sabato · Parte bassa B' }, exercises: [reps('reverse-lunge', 3, 10), reps('assisted-nordic-curl', 3, 6), reps('single-leg-glute-bridge', 3, 10), hold('side-plank', 3, 20)] },
    ],
  },
  {
    id: 'grease-the-groove',
    name: { en: 'Grease the Groove', it: 'Grease the Groove' },
    summary: { en: 'Spread easy, high-quality practice across the week.', it: 'Distribuisci sessioni brevi e tecniche durante la settimana.' },
    details: { en: 'Choose one main movement and perform several easy mini-sessions on practice days. Keep every set far from failure; this template is a reminder to log one micro-session at a time.', it: 'Scegli un movimento principale e svolgi più mini-sessioni facili nei giorni di pratica. Mantieni ogni serie lontana dal cedimento; questo schema ti aiuta a registrare una micro-sessione alla volta.' },
    frequency: { en: '5 practice days / week · short sessions', it: '5 giorni di pratica / settimana · sessioni brevi' },
    sessions: [
      { id: 'gtg-pull', name: { en: 'Pull-up practice', it: 'Pratica trazioni' }, day: { en: 'Monday · Pull-up micro-session', it: 'Lunedì · Micro-sessione trazioni' }, exercises: [reps('band-assisted-pull-up', 2, 3, 60), hold('dead-hang', 1, 15, 45)] },
      { id: 'gtg-push', name: { en: 'Push-up practice', it: 'Pratica piegamenti' }, day: { en: 'Tuesday · Push-up micro-session', it: 'Martedì · Micro-sessione piegamenti' }, exercises: [reps('push-up', 2, 5, 60), hold('hollow-body-hold', 1, 15, 45)] },
      { id: 'gtg-pull-2', name: { en: 'Pull-up practice', it: 'Pratica trazioni' }, day: { en: 'Wednesday · Pull-up micro-session', it: 'Mercoledì · Micro-sessione trazioni' }, exercises: [reps('band-assisted-pull-up', 2, 3, 60), hold('dead-hang', 1, 15, 45)] },
      { id: 'gtg-push-2', name: { en: 'Push-up practice', it: 'Pratica piegamenti' }, day: { en: 'Thursday · Push-up micro-session', it: 'Giovedì · Micro-sessione piegamenti' }, exercises: [reps('push-up', 2, 5, 60), hold('hollow-body-hold', 1, 15, 45)] },
      { id: 'gtg-pull-3', name: { en: 'Pull-up practice', it: 'Pratica trazioni' }, day: { en: 'Friday · Pull-up micro-session', it: 'Venerdì · Micro-sessione trazioni' }, exercises: [reps('band-assisted-pull-up', 2, 3, 60), hold('dead-hang', 1, 15, 45)] },
    ],
  },
];

export function findProgram(id: string | string[] | undefined): ProgramTemplate | undefined {
  const programId = Array.isArray(id) ? id[0] : id;
  return programTemplates.find((program) => program.id === programId);
}

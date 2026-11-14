import { LinkableUser } from '../../core/models/facility.models';
import { linkOptions, prefillFromUser } from './link-user.helpers';

const user = (over: Partial<LinkableUser> = {}): LinkableUser => ({
  id: 'u1',
  email: 'tono@udix.mx',
  fullName: 'Toño Pérez',
  role: 'staff',
  professionalLicense: null,
  linkedPersonnelId: null,
  ...over,
});

const empty = { fullName: '', role: 'tecnico-radiologo' as const, professionalLicense: '' };

describe('vincular persona con usuario', () => {
  it('prellena el nombre y deja el rol que eligieron', () => {
    expect(prefillFromUser(user(), empty, true)).toEqual({ fullName: 'Toño Pérez' });
  });

  it('un intérprete nuevo se sugiere como médico radiólogo con su cédula', () => {
    const rita = user({ role: 'interpreter', fullName: 'Rita Gómez', professionalLicense: '12345678' });
    expect(prefillFromUser(rita, empty, true)).toEqual({
      fullName: 'Rita Gómez',
      role: 'medico-radiologo',
      professionalLicense: '12345678',
    });
  });

  it('no pisa lo que ya escribieron ni cambia el rol al editar', () => {
    const rita = user({ role: 'interpreter', professionalLicense: '12345678' });
    const typed = { fullName: 'Dra. Rita', role: 'medico' as const, professionalLicense: '7654321' };
    expect(prefillFromUser(rita, typed, false)).toEqual({});
  });

  it('marca como no disponibles a los ya vinculados con otra persona, no a la actual', () => {
    const options = linkOptions(
      [user({ id: 'a', linkedPersonnelId: 'p1' }), user({ id: 'b', linkedPersonnelId: 'p2' }), user({ id: 'c' })],
      'p1',
    );
    expect(options.map((o) => [o.user.id, o.taken])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
  });

  it('la etiqueta trae nombre y correo; sin nombre, solo el correo', () => {
    const [named, unnamed] = linkOptions([user(), user({ id: 'x', fullName: '' })]);
    expect(named.label).toBe('Toño Pérez · tono@udix.mx');
    expect(unnamed.label).toBe('tono@udix.mx');
  });
});

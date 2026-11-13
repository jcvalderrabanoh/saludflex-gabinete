import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AgendaApiService } from '../../core/services/agenda-api.service';
import { agendaRouteGuard } from './agenda.guard';

function run(enabled: boolean) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AgendaApiService, useValue: { enabled: () => of(enabled) } }],
  });
  const result = TestBed.runInInjectionContext(() => agendaRouteGuard()({} as never, {} as never));
  return firstValueFrom(result as Observable<boolean | UrlTree>);
}

describe('agendaRouteGuard', () => {
  it('abre la agenda en una cuenta que la tiene encendida', async () => {
    expect(await run(true)).toBeTrue();
  });

  it('una cuenta con la agenda apagada regresa a Hoy', async () => {
    const result = await run(false);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/operacion/hoy');
  });
});

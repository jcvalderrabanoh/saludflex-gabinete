import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('se crea', () => {
    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });

  it('las pantallas de operación cuelgan de /operacion y requieren sesión', () => {
    const operacion = routes.find((r) => r.path === 'operacion');
    expect(operacion?.canActivate?.length).toBe(1);
    expect(operacion?.children?.map((c) => c.path)).toEqual(['hoy', 'obligaciones', 'equipos-y-personal', 'carpeta', 'establecimientos', 'plataforma', '']);
  });
});

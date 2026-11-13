import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EvaluatedObligation } from '../../core/models/facility.models';
import { RecordEvidenceData, RecordEvidenceDialogComponent } from './record-evidence.dialog';

function render() {
  const data: RecordEvidenceData = {
    obligation: { id: 'ob-1', title: 'Aviso de funcionamiento', kind: 'document', evidence: 'Acuse sellado' } as EvaluatedObligation,
    today: '2026-11-12',
  };
  TestBed.configureTestingModule({
    imports: [RecordEvidenceDialogComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(RecordEvidenceDialogComponent);
  fixture.detectChanges();
  return fixture;
}

describe('Registrar evidencia: adjuntar archivo', () => {
  it('no fuerza la cámara: en el celular deja elegir entre cámara, fotos y archivos', () => {
    const input = render().nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.hasAttribute('capture')).toBeFalse();
  });

  it('acepta imágenes y PDF', () => {
    const input = render().nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*,application/pdf');
  });

  it('muestra el nombre del archivo elegido', () => {
    const fixture = render();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File(['%PDF'], 'acuse.pdf', { type: 'application/pdf' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.upload').textContent).toContain('acuse.pdf');
  });

  it('sin archivo elegido invita a tomar foto o subir un archivo', () => {
    const fixture = render();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.upload .cta')).not.toBeNull();
  });
});

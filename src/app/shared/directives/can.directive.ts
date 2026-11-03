import { Directive, TemplateRef, ViewContainerRef, computed, effect, inject, input } from '@angular/core';
import { EvaluatedObligation } from '../../core/models/facility.models';
import { FacilityAction, PermissionsService } from '../../core/services/permissions.service';

/** Pinta el contenido solo cuando `show()` es verdadero (reacciona a cambios de sesión). */
abstract class ShowWhen {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  protected readonly permissions = inject(PermissionsService);
  protected abstract readonly show: () => boolean;
  private shown = false;

  constructor() {
    effect(() => {
      const visible = this.show();
      if (visible === this.shown) return;
      this.shown = visible;
      if (visible) this.container.createEmbeddedView(this.template);
      else this.container.clear();
    });
  }
}

/** `<button *appCan="'manage'">`: oculta la acción si el permiso no deja usarla. */
@Directive({ selector: '[appCan]', standalone: true })
export class CanDirective extends ShowWhen {
  readonly appCan = input.required<FacilityAction>();
  protected readonly show = computed(() => this.permissions.can(this.appCan()));
}

/** `<button *appCanRecord="obligation">`: registrar en esa obligación (global o asignada). */
@Directive({ selector: '[appCanRecord]', standalone: true })
export class CanRecordDirective extends ShowWhen {
  readonly appCanRecord = input.required<Pick<EvaluatedObligation, 'responsibleUserIds'>>();
  protected readonly show = computed(() => this.permissions.canRecord(this.appCanRecord()));
}

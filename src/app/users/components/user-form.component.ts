import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UsersService } from '../services/users.service';
import { User, CreateUserDto, UpdateUserDto } from '../../shared/interfaces/user.interface';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar Usuario' : 'Crear Usuario' }}</h2>
    
    <mat-dialog-content>
      <form [formGroup]="userForm" class="user-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="firstName" required>
          <mat-error *ngIf="userForm.get('firstName')?.hasError('required')">
            El nombre es requerido
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Apellido</mat-label>
          <input matInput formControlName="lastName" required>
          <mat-error *ngIf="userForm.get('lastName')?.hasError('required')">
            El apellido es requerido
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" required>
          <mat-error *ngIf="userForm.get('email')?.hasError('required')">
            El email es requerido
          </mat-error>
          <mat-error *ngIf="userForm.get('email')?.hasError('email')">
            Ingresa un email válido
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width" *ngIf="!isEdit">
          <mat-label>Contraseña</mat-label>
          <input matInput type="password" formControlName="password" required>
          <mat-error *ngIf="userForm.get('password')?.hasError('required')">
            La contraseña es requerida
          </mat-error>
          <mat-error *ngIf="userForm.get('password')?.hasError('minlength')">
            La contraseña debe tener al menos 6 caracteres
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width" *ngIf="isEdit">
          <mat-label>Nueva Contraseña (opcional)</mat-label>
          <input matInput type="password" formControlName="password">
          <mat-error *ngIf="userForm.get('password')?.hasError('minlength')">
            La contraseña debe tener al menos 6 caracteres
          </mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancelar</button>
      <button 
        mat-raised-button 
        color="primary" 
        (click)="onSubmit()"
        [disabled]="userForm.invalid || loading">
        <mat-spinner *ngIf="loading" diameter="20"></mat-spinner>
        <span *ngIf="!loading">{{ isEdit ? 'Actualizar' : 'Crear' }}</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .user-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 400px;
    }

    .full-width {
      width: 100%;
    }

    mat-dialog-content {
      padding: 20px 24px;
    }

    mat-dialog-actions {
      padding: 8px 24px 20px;
    }
  `]
})
export class UserFormComponent implements OnInit {
  userForm: FormGroup;
  loading = false;
  isEdit: boolean;
  user: User | null;

  constructor(
    private fb: FormBuilder,
    private usersService: UsersService,
    private dialogRef: MatDialogRef<UserFormComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: { user: User | null; isEdit: boolean }
  ) {
    this.isEdit = data.isEdit;
    this.user = data.user;

    this.userForm = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', this.isEdit ? [Validators.minLength(6)] : [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    if (this.isEdit && this.user) {
      this.userForm.patchValue({
        firstName: this.user.firstName,
        lastName: this.user.lastName,
        email: this.user.email
      });
    }
  }

  onSubmit(): void {
    if (this.userForm.valid) {
      this.loading = true;
      const formData = this.userForm.value;

      if (this.isEdit && this.user) {
        const updateData: UpdateUserDto = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email
        };

        if (formData.password) {
          updateData.password = formData.password;
        }

        this.usersService.updateUser(this.user._id, updateData).subscribe({
          next: (response) => {
            this.loading = false;
            if (response.success) {
              this.snackBar.open('Usuario actualizado exitosamente', 'Cerrar', {
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              this.dialogRef.close(true);
            }
          },
          error: (error) => {
            this.loading = false;
            const errorMessage = error.error?.message || 'Error al actualizar usuario';
            this.snackBar.open(errorMessage, 'Cerrar', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      } else {
        const createData: CreateUserDto = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password
        };

        this.usersService.createUser(createData).subscribe({
          next: (response) => {
            this.loading = false;
            if (response.success) {
              this.snackBar.open('Usuario creado exitosamente', 'Cerrar', {
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              this.dialogRef.close(true);
            }
          },
          error: (error) => {
            this.loading = false;
            const errorMessage = error.error?.message || 'Error al crear usuario';
            this.snackBar.open(errorMessage, 'Cerrar', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

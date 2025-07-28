import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { UsersService } from '../../users/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../shared/interfaces/user.interface';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="dashboard-container">
      <div class="dashboard-header">
        <h1>Dashboard</h1>
        <p>Bienvenido, {{ currentUser?.firstName }} {{ currentUser?.lastName }}</p>
      </div>

      <div class="stats-grid" *ngIf="!loading; else loadingTemplate">
        <mat-card class="stat-card">
          <mat-card-content>
            <div class="stat-content">
              <mat-icon class="stat-icon users-icon">people</mat-icon>
              <div class="stat-info">
                <h2>{{ totalUsers }}</h2>
                <p>Total de Usuarios</p>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card">
          <mat-card-content>
            <div class="stat-content">
              <mat-icon class="stat-icon active-icon">person</mat-icon>
              <div class="stat-info">
                <h2>{{ activeUsers }}</h2>
                <p>Usuarios Activos</p>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card">
          <mat-card-content>
            <div class="stat-content">
              <mat-icon class="stat-icon recent-icon">schedule</mat-icon>
              <div class="stat-info">
                <h2>{{ recentUsers }}</h2>
                <p>Registros Recientes</p>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <ng-template #loadingTemplate>
        <div class="loading-container">
          <mat-spinner></mat-spinner>
          <p>Cargando estadísticas...</p>
        </div>
      </ng-template>

      <div class="actions-section">
        <h2>Acciones Rápidas</h2>
        <div class="actions-grid">
          <mat-card class="action-card" (click)="navigateToUsers()">
            <mat-card-content>
              <mat-icon>manage_accounts</mat-icon>
              <h3>Gestionar Usuarios</h3>
              <p>Ver, crear, editar y eliminar usuarios</p>
            </mat-card-content>
          </mat-card>

          <mat-card class="action-card" (click)="logout()">
            <mat-card-content>
              <mat-icon>logout</mat-icon>
              <h3>Cerrar Sesión</h3>
              <p>Salir de la aplicación</p>
            </mat-card-content>
          </mat-card>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .dashboard-header {
      margin-bottom: 32px;
      text-align: center;
    }

    .dashboard-header h1 {
      margin: 0;
      color: #333;
      font-size: 2.5rem;
    }

    .dashboard-header p {
      margin: 8px 0 0 0;
      color: #666;
      font-size: 1.1rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
      margin-bottom: 48px;
    }

    .stat-card {
      cursor: default;
    }

    .stat-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .stat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .users-icon {
      color: #2196F3;
    }

    .active-icon {
      color: #4CAF50;
    }

    .recent-icon {
      color: #FF9800;
    }

    .stat-info h2 {
      margin: 0;
      font-size: 2rem;
      font-weight: bold;
      color: #333;
    }

    .stat-info p {
      margin: 4px 0 0 0;
      color: #666;
      font-size: 0.9rem;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      gap: 16px;
    }

    .actions-section h2 {
      margin-bottom: 24px;
      color: #333;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
    }

    .action-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .action-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .action-card mat-card-content {
      text-align: center;
      padding: 24px;
    }

    .action-card mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #2196F3;
      margin-bottom: 16px;
    }

    .action-card h3 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .action-card p {
      margin: 0;
      color: #666;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      .dashboard-container {
        padding: 16px;
      }

      .stats-grid,
      .actions-grid {
        grid-template-columns: 1fr;
      }

      .dashboard-header h1 {
        font-size: 2rem;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  currentUser: User | null = null;
  totalUsers = 0;
  activeUsers = 0;
  recentUsers = 0;
  loading = true;

  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.usersService.getUsers().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const users = response.data;
          this.totalUsers = users.length;
          this.activeUsers = users.filter(user => user.status === 'Active').length;
          
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          this.recentUsers = users.filter(user => 
            new Date(user.createdAt) > oneWeekAgo
          ).length;
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading dashboard data:', error);
        this.loading = false;
      }
    });
  }

  navigateToUsers(): void {
    this.router.navigate(['/users']);
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (error) => {
        console.error('Error during logout:', error);
        this.router.navigate(['/login']);
      }
    });
  }
}

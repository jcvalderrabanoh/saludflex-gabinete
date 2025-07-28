import { Routes } from '@angular/router';
import { AuthGuard } from './auth/guards/auth.guard';
import { LoginComponent } from './auth/components/login.component';
import { DashboardComponent } from './dashboard/components/dashboard.component';
import { UserListComponent } from './users/components/user-list.component';
import { LayoutComponent } from './shared/components/layout.component';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { 
        path: 'dashboard', 
        component: DashboardComponent
      },
      { 
        path: 'users', 
        component: UserListComponent
      }
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];

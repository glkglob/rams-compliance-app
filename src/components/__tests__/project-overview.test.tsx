import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectOverview } from '../projects/project-overview';

describe('ProjectOverview', () => {
  const mockProject = {
    id: '123',
    name: 'Test Project',
    client_name: 'Test Client',
    site_address: '123 Test Street',
    description: 'A test project description',
    compliance_threshold: 85,
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  };

  it('should render project details', () => {
    render(<ProjectOverview project={mockProject} />);

    expect(screen.getByText('Test Client')).toBeDefined();
    expect(screen.getByText('123 Test Street')).toBeDefined();
    expect(screen.getByText('85%')).toBeDefined();
  });

  it('should display active status badge', () => {
    render(<ProjectOverview project={mockProject} />);
    expect(screen.getByText('active')).toBeDefined();
  });

  it('should render project description', () => {
    render(<ProjectOverview project={mockProject} />);
    expect(screen.getByText('A test project description')).toBeDefined();
  });

  it('should handle missing optional fields', () => {
    const minimalProject = {
      ...mockProject,
      client_name: null,
      site_address: null,
      description: null,
    };

    render(<ProjectOverview project={minimalProject} />);
    expect(screen.queryByText('Test Client')).toBeNull();
    expect(screen.queryByText('123 Test Street')).toBeNull();
  });
});

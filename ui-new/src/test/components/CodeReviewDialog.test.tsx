/**
 * CodeReviewDialog Component Tests
 * 
 * Tests UI interactions, code editing, approval/rejection flows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeReviewDialog } from '../../components/CodeReviewDialog';
import type { CodeReviewRequest } from '../../services/clientTools/types';

describe('CodeReviewDialog', () => {
  const mockOnApprove = vi.fn();
  const mockOnReject = vi.fn();
  const mockOnAlwaysAllow = vi.fn();

  const mockHighRiskRequest: CodeReviewRequest = {
    id: '123',
    feature: 'javascript',
    description: 'Execute dangerous code',
    code: 'console.log("test")',
    args: { code: 'console.log("test")' },
    riskLevel: 'high',
    timestamp: Date.now()
  };

  const mockMediumRiskRequest: CodeReviewRequest = {
    id: '456',
    feature: 'storage_write',
    description: 'Write to localStorage',
    code: undefined,
    args: { storage_key: 'key', storage_value: 'value' },
    riskLevel: 'medium',
    timestamp: Date.now()
  };

  const mockLowRiskRequest: CodeReviewRequest = {
    id: '789',
    feature: 'storage_read',
    description: 'Read from localStorage',
    code: undefined,
    args: { storage_key: 'key' },
    riskLevel: 'low',
    timestamp: Date.now()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when closed', () => {
      render(
        <CodeReviewDialog
          isOpen={false}
          request={null}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.queryByText('Code Review Required')).not.toBeInTheDocument();
    });

    it('should render when open with request', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('Code Review Required')).toBeInTheDocument();
      // Find the badge specifically (not the safety tips text)
      const badges = screen.getAllByText(/high risk/i);
      expect(badges.length).toBeGreaterThan(0);
      expect(screen.getByText(/Execute dangerous code/)).toBeInTheDocument();
    });

    it('should display feature name', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(/javascript/)).toBeInTheDocument();
    });

    it('should display risk level badge', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockMediumRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(/medium risk/i)).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('should start on Review tab', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const reviewTab = screen.getByRole('button', { name: /Review/i });
      expect(reviewTab).toHaveClass('border-blue-500');
    });

    it('should switch to Edit tab', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const editTab = screen.getByRole('button', { name: /Edit/i });
      await user.click(editTab);

      expect(editTab).toHaveClass('border-blue-500');
      expect(screen.getByText(/edit mode/i)).toBeInTheDocument();
    });

    it('should show modified indicator when code is edited', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      // Switch to Edit tab
      const editTab = screen.getByRole('button', { name: /Edit/i });
      await user.click(editTab);

      // Edit code
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'console.log("modified")');

      // Check for modified indicator
      await waitFor(() => {
        expect(screen.getByText(/Edit \(Modified\)/)).toBeInTheDocument();
      });
    });
  });

  describe('Review Tab Content', () => {
    it('should display safety tips', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText('🛡️ Safety Tips')).toBeInTheDocument();
      expect(screen.getByText(/Review the code carefully/)).toBeInTheDocument();
    });

    it('should display code when provided', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(/Code to Execute:/)).toBeInTheDocument();
      expect(screen.getByText(/console.log\("test"\)/)).toBeInTheDocument();
    });

    it('should display arguments', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockMediumRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(/Arguments:/)).toBeInTheDocument();
      expect(screen.getByText(/"storage_key"/)).toBeInTheDocument();
    });

    it('should show extra warning for high risk', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      expect(screen.getByText(/HIGH RISK: Exercise extreme caution/)).toBeInTheDocument();
    });
  });

  describe('Edit Tab Content', () => {
    it('should show editable textarea', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      // Switch to Edit tab
      await user.click(screen.getByRole('button', { name: /Edit/i }));

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('console.log("test")');
    });

    it('should show character count', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      await user.click(screen.getByRole('button', { name: /Edit/i }));

      expect(screen.getByText(/\d+ characters/)).toBeInTheDocument();
    });

    it('should allow code editing', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      await user.click(screen.getByRole('button', { name: /Edit/i }));

      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'return 42');

      expect(textarea).toHaveValue('return 42');
    });

    it('should show reset button when code is modified', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      await user.click(screen.getByRole('button', { name: /Edit/i }));

      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'modified');

      await waitFor(() => {
        expect(screen.getByText('Reset Changes')).toBeInTheDocument();
      });
    });

    it('should reset changes when reset button clicked', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      await user.click(screen.getByRole('button', { name: /Edit/i }));

      const textarea = screen.getByRole('textbox');
      
      await user.clear(textarea);
      await user.type(textarea, 'modified');

      const resetButton = screen.getByText('Reset Changes');
      await user.click(resetButton);

      expect(textarea).toHaveValue('console.log("test")');
    });
  });

  describe('Actions', () => {
    it('should call onReject when reject button clicked', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const rejectButton = screen.getByRole('button', { name: /Reject/i });
      await user.click(rejectButton);

      expect(mockOnReject).toHaveBeenCalledOnce();
      expect(mockOnApprove).not.toHaveBeenCalled();
    });

    it('should call onApprove when approve button clicked', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const approveButton = screen.getByRole('button', { name: /Approve & Execute/i });
      await user.click(approveButton);

      expect(mockOnApprove).toHaveBeenCalledOnce();
      expect(mockOnApprove).toHaveBeenCalledWith(); // No edited code
    });

    it('should call onApprove with edited code', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      // Switch to Edit tab and modify code
      await user.click(screen.getByRole('button', { name: /Edit/i }));
      
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'return 123');

      // Approve
      const approveButton = screen.getByRole('button', { name: /Approve with Edits/i });
      await user.click(approveButton);

      expect(mockOnApprove).toHaveBeenCalledWith('return 123');
    });

    it('should show "Always Allow" for low risk only', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockLowRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
          onAlwaysAllow={mockOnAlwaysAllow}
        />
      );

      expect(screen.getByText(/Always Allow/)).toBeInTheDocument();
    });

    it('should not show "Always Allow" for high risk', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
          onAlwaysAllow={mockOnAlwaysAllow}
        />
      );

      expect(screen.queryByText(/Always Allow/)).not.toBeInTheDocument();
    });

    it('should call onAlwaysAllow when button clicked', async () => {
      const user = userEvent.setup();

      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockLowRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
          onAlwaysAllow={mockOnAlwaysAllow}
        />
      );

      const alwaysAllowButton = screen.getByText(/Always Allow/);
      await user.click(alwaysAllowButton);

      expect(mockOnAlwaysAllow).toHaveBeenCalledOnce();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should close on Escape key', async () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(mockOnReject).toHaveBeenCalled();
      });
    });
  });

  describe('Risk Level Styling', () => {
    it('should show red styling for high risk', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      // Find the badge specifically (not the safety tips text)
      const badges = screen.getAllByText(/high risk/i);
      const badge = badges.find(el => el.tagName === 'SPAN' && el.className.includes('rounded-full'));
      expect(badge).toBeDefined();
      expect(badge).toHaveClass('bg-red-100');
    });

    it('should show yellow styling for medium risk', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockMediumRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const badge = screen.getByText(/medium risk/i);
      expect(badge).toHaveClass('bg-yellow-100');
    });

    it('should show green styling for low risk', () => {
      render(
        <CodeReviewDialog
          isOpen={true}
          request={mockLowRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      const badge = screen.getByText(/low risk/i);
      expect(badge).toHaveClass('bg-green-100');
    });

    it('should use risk-appropriate approve button color', () => {
      const { rerender } = render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      let approveButton = screen.getByRole('button', { name: /Approve & Execute/i });
      expect(approveButton).toHaveClass('bg-red-600');

      rerender(
        <CodeReviewDialog
          isOpen={true}
          request={mockMediumRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      approveButton = screen.getByRole('button', { name: /Approve & Execute/i });
      expect(approveButton).toHaveClass('bg-yellow-600');
    });
  });

  describe('State Management', () => {
    it('should reset state when request changes', () => {
      const { rerender } = render(
        <CodeReviewDialog
          isOpen={true}
          request={mockHighRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      // Initial request
      expect(screen.getByText(/Execute dangerous code/)).toBeInTheDocument();

      // Change request
      rerender(
        <CodeReviewDialog
          isOpen={true}
          request={mockMediumRiskRequest}
          onApprove={mockOnApprove}
          onReject={mockOnReject}
        />
      );

      // Should show new request
      expect(screen.getByText(/Write to localStorage/)).toBeInTheDocument();
      expect(screen.queryByText(/Execute dangerous code/)).not.toBeInTheDocument();
    });
  });
});

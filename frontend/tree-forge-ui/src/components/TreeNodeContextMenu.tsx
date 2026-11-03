import { useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Search, 
  Split, 
  Edit3,
  Tag, 
  Trash2, 
  Copy, 
  Clipboard 
} from "lucide-react";

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onAction: (action: string) => void;
  copiedNodeNumber?: number | null;
  isParentNode?: boolean;
}

const TreeNodeContextMenu = ({ isOpen, position, onClose, onAction, copiedNodeNumber, isParentNode = false }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const baseMenuItems = [
    { 
      id: 'auto-train', 
      label: 'Auto train', 
      icon: Brain,
      action: () => onAction('auto-train')
    },
    { 
      id: 'find-split', 
      label: 'Find Split', 
      icon: Search,
      action: () => onAction('find-split')
    },
    { 
      id: 'force-split', 
      label: 'Force Split', 
      icon: Split,
      action: () => onAction('force-split')
    }
  ];

  const editSplitItem = {
    id: 'edit-split', 
    label: 'Edit split', 
    icon: Edit3,
    action: () => onAction('edit-split'),
    disabled: !isParentNode
  };

  const allMenuItems = [
    ...baseMenuItems,
    editSplitItem,
    { 
      id: 'add-label', 
      label: 'Add label', 
      icon: Tag,
      action: () => onAction('add-label')
    },
    { 
      id: 'separator-1', 
      label: '', 
      icon: null,
      action: null
    },
    { 
      id: 'delete-subtree', 
      label: 'Delete sub tree', 
      icon: Trash2,
      action: () => onAction('delete-subtree'),
      destructive: true
    },
    { 
      id: 'separator-2', 
      label: '', 
      icon: null,
      action: null
    },
    { 
      id: 'copy-subtree', 
      label: 'Copy sub tree', 
      icon: Copy,
      action: () => onAction('copy-subtree')
    },
    { 
      id: 'paste-subtree', 
      label: 'Paste sub tree', 
      icon: Clipboard,
      action: () => onAction('paste-subtree'),
      disabled: !copiedNodeNumber
    }
  ];

  return (
    <div 
      className="fixed z-50"
      style={{ 
        left: position.x, 
        top: position.y
      }}
    >
      <Card ref={menuRef} className="shadow-lg border-border bg-card animate-scale-in">
        <CardContent className="p-1 w-44">
          {allMenuItems.map((item) => {
            if (!item.action) {
              return <Separator key={item.id} className="my-1" />;
            }

            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                disabled={item.disabled}
                className={`w-full justify-start px-3 py-2 h-auto text-sm hover:bg-accent ${
                  item.destructive ? 'text-destructive hover:text-destructive' : ''
                } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (!item.disabled) {
                    item.action();
                    onClose();
                  }
                }}
              >
                {Icon && <Icon className="h-4 w-4 mr-3" />}
                {item.label}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default TreeNodeContextMenu;

import { ChangeEvent } from 'react';

export interface FunctionCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  color: string;
}

export interface NavItem {
  icon: string;
  text: string;
  path: string;
}

export interface AtomPosition {
  x: number;
  y: number;
  z: number;
} 
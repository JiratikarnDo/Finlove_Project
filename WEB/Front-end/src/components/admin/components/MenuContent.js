import * as React from 'react';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import GroupsIcon from '@mui/icons-material/Groups';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import CategoryIcon from '@mui/icons-material/Category';
import ExtensionIcon from '@mui/icons-material/Extension';

export default function MenuContent() {
  return (
    <Stack sx={{ flexGrow: 1, p: 1, justifyContent: 'space-between' }}>
      <List dense>
        <ListItemButton selected href="/admin">
          <ListItemIcon><DashboardIcon /></ListItemIcon>
          <ListItemText primary='แดชบอร์ด' />
        </ListItemButton>
        <ListItemButton href="/admin/order">
          <ListItemIcon><ShoppingCartIcon /></ListItemIcon>
          <ListItemText primary='รายการสั่งซื้อ' />
        </ListItemButton>
        <ListItemButton href="/admin/customer">
          <ListItemIcon><GroupsIcon /></ListItemIcon>
          <ListItemText primary='ลูกค้า' />
        </ListItemButton>
        <ListItemButton href="#">
          <ListItemIcon><Diversity3Icon /></ListItemIcon>
          <ListItemText primary='พนักงาน' />
        </ListItemButton>
        <ListItemButton href="#">
          <ListItemIcon><CategoryIcon /></ListItemIcon>
          <ListItemText primary='ประเภทสินค้า' />
        </ListItemButton>
        <ListItemButton href="#">
          <ListItemIcon><ExtensionIcon /></ListItemIcon>
          <ListItemText primary='สินค้า' />
        </ListItemButton>
      </List>
    </Stack>
  );
}

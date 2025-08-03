import React, { useEffect, useState } from 'react';
import {
  Typography, Avatar, Button, ButtonGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Box,
  Container, Grid, Card, CardContent, Drawer, List, ListItem, ListItemIcon, ListItemText, Snackbar, Alert
} from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { People as PeopleIcon, Settings as SettingsIcon, ExitToApp as ExitToAppIcon } from '@mui/icons-material';

const url = process.env.REACT_APP_BASE_URL;
const token = localStorage.getItem('token');

export default function Dashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalReportedUsers, setTotalReportedUsers] = useState(0);

  useEffect(() => {
    axios.get(`${url}/stats/total-users`)
      .then(response => {
        setTotalUsers(response.data.total_users);
      })
      .catch(error => {
        console.error('Error fetching total users:', error);
        showNotification('Error fetching total users', 'error');
      });

    axios.get(`${url}/stats/total-reported-users`)
      .then(response => {
        setTotalReportedUsers(response.data.total_reported_users);
      })
      .catch(error => {
        console.error('Error fetching total reported users:', error);
        showNotification('Error fetching total reported users', 'error');
      });

    axios.get(`${url}/userreport`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((response) => {
        const data = response.data;
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          setUsers([]);
        }
      })
      .catch((error) => {
        console.error('Error fetching users:', error);
        setUsers([]);
      });
  }, []);

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handleBanUser = (userID) => {
    axios.put(`${url}/user/ban/${userID}`, null, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((response) => {
        if (response.data.status === true) {
          showNotification(response.data.message, 'success');
          setUsers((prevUsers) => prevUsers.map(user => user.userID === userID ? { ...user, isActive: 0 } : user));
        } else {
          showNotification('Failed to suspend user', 'error');
        }
      })
      .catch((error) => {
        showNotification('Error suspending user', 'error');
        console.error('Error suspending user:', error);
      });
  };

  const handleUnbanUser = (userID) => {
    axios.put(`${url}/user/unban/${userID}`, null, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((response) => {
        if (response.data.status === true) {
          showNotification(response.data.message, 'success');
          setUsers((prevUsers) => prevUsers.map(user => user.userID === userID ? { ...user, isActive: 1 } : user));
        } else {
          showNotification('Failed to unban user', 'error');
        }
      })
      .catch((error) => {
        showNotification('Error unbanning user', 'error');
        console.error('Error unbanning user:', error);
      });
  };

  const handleLogout = () => {
    axios.post(`${url}/logout`, {}, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((response) => {
        if (response.data.status === true) {
          localStorage.removeItem('token');
          localStorage.removeItem('positionID');
          showNotification(response.data.message, 'success');
          navigate('/signinuser');
          window.location.reload();
        }
      })
      .catch((error) => {
        showNotification('Error during logout', 'error');
        console.error('Error during logout:', error);
      });
  };

  const drawerWidth = 240;
  const menuItems = [
    { text: 'จัดการข้อมูลผู้ใช้', action: () => navigate('/admin/user'), icon: <PeopleIcon /> },
    { text: 'จัดการข้อมูลพนักงาน', action: () => navigate('/admin/employee'), icon: <SettingsIcon /> },
    { text: 'เพิ่มผู้ดูแล', action: () => navigate('/addEmployee'), icon: <SettingsIcon /> },
    { text: 'เพิ่มความชอบ', action: () => navigate('/managepreferences'), icon: <SettingsIcon /> },
    { text: 'ออกจากระบบ', action: handleLogout, icon: <ExitToAppIcon /> }
  ];

  return (
    <Box sx={{ display: 'flex', backgroundColor: '#F8E9F0' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            backgroundColor: '#f8e9f0',
            borderRight: '0px solid #e0e0e0',
            paddingTop: '48px',
            paddingLeft: '25px'
          },
        }}
      >
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem
                button
                key={item.text}
                onClick={item.action}
                sx={{
                  padding: '15px 20px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '10px',
                  border: '2px solid black',
                  marginBottom: '10px',
                  '&:hover': {
                    backgroundColor: '#f8e9f0',
                    color: '#fff',
                    borderColor: '#ff69b4',
                  },
                }}
              >
                <ListItemIcon sx={{ color: '#000' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} sx={{ color: '#000' }} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, padding: 3, backgroundColor: '#F8E9F0', minHeight: '100vh' }}>
        <Container maxWidth="lg" sx={{ mt: 4 }}>
          {/* Summary Section */}
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Card sx={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)', padding: 2 }}>
                <CardContent>
                  <Typography variant="h5" gutterBottom>จำนวนผู้ใช้งานทั้งหมด</Typography>
                  <Typography variant="h3" color="primary">{totalUsers}</Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)', padding: 2 }}>
                <CardContent>
                  <Typography variant="h5" gutterBottom>จำนวนผู้ใช้ที่ถูก Report ทั้งหมด</Typography>
                  <Typography variant="h3" color="secondary">{totalReportedUsers}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* User Report Table */}
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>ผู้ใช้ถูกระงับใหม่</Typography>
            <TableContainer component={Paper} sx={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)', border: '2px solid black' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell align="center">รหัส</TableCell>
                    <TableCell align="center">รูป</TableCell>
                    <TableCell align="left">ชื่อผู้ใช้</TableCell>
                    <TableCell align="left">เหตุผล</TableCell>
                    <TableCell align="center">จัดการข้อมูล</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.userID}>
                      <TableCell align="center">{user.userID}</TableCell>
                      <TableCell align="center">
                        <Avatar src={`${url}/user/image/${user.imageFile}`} alt={user.username} sx={{ width: 50, height: 50 }} />
                      </TableCell>
                      <TableCell align="left">{user.username}</TableCell>
                      <TableCell align="left">{user.reportType || 'ไม่ระบุเหตุผล'}</TableCell>
                      <TableCell align="center">
                        <ButtonGroup>
                          <Button
                            variant="contained"
                            sx={{ backgroundColor: '#e57373', color: '#fff' }}
                            onClick={() => handleBanUser(user.userID)}
                            disabled={user.isActive === 0}
                          >
                            ระงับผู้ใช้
                          </Button>
                          <Button
                            variant="contained"
                            sx={{ backgroundColor: '#64b5f6', color: '#fff' }}
                            onClick={() => handleUnbanUser(user.userID)}
                            disabled={user.isActive === 1}
                          >
                            ปลดแบน
                          </Button>
                        </ButtonGroup>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Notification Snackbar */}
          <Snackbar
            open={notification.open}
            autoHideDuration={6000}
            onClose={handleCloseNotification}
          >
            <Alert onClose={handleCloseNotification} severity={notification.severity}>
              {notification.message}
            </Alert>
          </Snackbar>
        </Container>
      </Box>
    </Box>
  );
}

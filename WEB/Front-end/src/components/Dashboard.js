import React, { useEffect, useState } from 'react';
import {
  Typography, Avatar, Button, ButtonGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Box,
  Container, Grid, Card, CardContent, Drawer, List, ListItem, ListItemIcon, ListItemText, Snackbar, Alert, Select, MenuItem, TextField
} from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { People as PeopleIcon, Settings as SettingsIcon, ExitToApp as ExitToAppIcon } from '@mui/icons-material';

// === NEW: กราฟ
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const url = process.env.REACT_APP_BASE_URL;
const token = localStorage.getItem('token');

export default function Dashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalReportedUsers, setTotalReportedUsers] = useState(0);

  // === NEW: ตัวกรองช่วงเวลา + granular
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const [dateTo, setDateTo] = useState(iso(today));
  const [dateFrom, setDateFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)));
  const [groupBy, setGroupBy] = useState('day');
  const [series, setSeries] = useState([]);

  useEffect(() => {
    // totals (รองรับหรือไม่รองรับ query params ก็ไม่พัง)
    axios.get(`${url}/stats/total-users`, { params: { from: dateFrom, to: dateTo } })
      .then(r => setTotalUsers(r.data?.total_users ?? 0))
      .catch(() => setTotalUsers(0));

    axios.get(`${url}/stats/total-reported-users`, { params: { from: dateFrom, to: dateTo } })
      .then(r => setTotalReportedUsers(r.data?.total_reported_users ?? 0))
      .catch(() => setTotalReportedUsers(0));

    // series สำหรับกราฟ
    axios.get(`${url}/stats/series`, { params: { from: dateFrom, to: dateTo, groupBy } })
      .then(r => setSeries(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSeries([]));

    // ตาราง report เดิม
    axios.get(`${url}/userreport`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then((response) => {
        const data = response.data;
        setUsers(Array.isArray(data) ? data : []);
      })
      .catch(() => setUsers([]));
  }, [dateFrom, dateTo, groupBy]); // <<< update เมื่อช่วงเวลา/ระดับเปลี่ยน

  const showNotification = (message, severity) => setNotification({ open: true, message, severity });
  const handleCloseNotification = () => setNotification({ ...notification, open: false });

  const handleBanUser = (userID) => {
    axios.put(`${url}/user/ban/${userID}`, null, { headers: { 'Authorization': `Bearer ${token}` } })
      .then((response) => {
        if (response.data.status === true) {
          showNotification(response.data.message, 'success');
          setUsers(prev => prev.map(u => u.userID === userID ? { ...u, isActive: 0 } : u));
        } else showNotification('Failed to suspend user', 'error');
      })
      .catch(() => showNotification('Error suspending user', 'error'));
  };

  const handleUnbanUser = (userID) => {
    axios.put(`${url}/user/unban/${userID}`, null, { headers: { 'Authorization': `Bearer ${token}` } })
      .then((response) => {
        if (response.data.status === true) {
          showNotification(response.data.message, 'success');
          setUsers(prev => prev.map(u => u.userID === userID ? { ...u, isActive: 1 } : u));
        } else showNotification('Failed to unban user', 'error');
      })
      .catch(() => showNotification('Error unbanning user', 'error'));
  };

  const handleLogout = () => {
    axios.post(`${url}/logout`, {}, { headers: { 'Authorization': `Bearer ${token}` } })
      .then((response) => {
        if (response.data.status === true) {
          localStorage.removeItem('token');
          localStorage.removeItem('positionID');
          showNotification(response.data.message, 'success');
          navigate('/signinuser');
          window.location.reload();
        }
      })
      .catch(() => showNotification('Error during logout', 'error'));
  };

  const drawerWidth = 240;
  const menuItems = [
    { text: 'จัดการข้อมูลผู้ใช้', action: () => navigate('/admin/user'), icon: <PeopleIcon /> },
    { text: 'จัดการข้อมูลพนักงาน', action: () => navigate('/admin/employee'), icon: <SettingsIcon /> },
    { text: 'เพิ่มผู้ดูแล', action: () => navigate('/addEmployee'), icon: <SettingsIcon /> },
    { text: 'เพิ่มความชอบ', action: () => navigate('/managepreferences'), icon: <SettingsIcon /> },
    { text: 'ออกจากระบบ', action: handleLogout, icon: <ExitToAppIcon /> }
  ];

  // ป้องกันกรณีเลือก to < from
  const clampTo = (v) => {
    if (v < dateFrom) setDateFrom(v);
    setDateTo(v);
  };

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
                  '&:hover': { backgroundColor: '#f8e9f0', color: '#fff', borderColor: '#ff69b4' },
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

          {/* === NEW: แถบตัวกรองช่วงเวลา / ระดับ === */}
          <Card sx={{ mb: 3, borderRadius: '10px' }}>
            <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ mr: 1 }}>ช่วงเวลา</Typography>
              <TextField
                label="จาก"
                type="date"
                size="small"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="ถึง"
                type="date"
                size="small"
                value={dateTo}
                onChange={(e) => clampTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Select size="small" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <MenuItem value="day">รายวัน</MenuItem>
                <MenuItem value="week">รายสัปดาห์</MenuItem>
              </Select>
            </CardContent>
          </Card>

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

          {/* === NEW: กราฟแนวโน้มสั้นๆ === */}
          <Box sx={{ mt: 4 }}>
            <Card sx={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', padding: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>แนวโน้มผู้ใช้ใหม่ / ผู้ถูกรีพอร์ต</Typography>
                {series.length > 0 ? (
                  <Box sx={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <LineChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="users" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="reports" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>
                    ยังไม่มีข้อมูลในช่วงที่เลือก
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          {/* User Report Table (ของเดิม) */}
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

          {/* Notification */}
          <Snackbar open={notification.open} autoHideDuration={6000} onClose={handleCloseNotification}>
            <Alert onClose={handleCloseNotification} severity={notification.severity}>
              {notification.message}
            </Alert>
          </Snackbar>
        </Container>
      </Box>
    </Box>
  );
}
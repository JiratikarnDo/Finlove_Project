import React, { useEffect, useState } from "react";
import { Button, Container, Paper, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Avatar, ButtonGroup, Snackbar, Alert } from '@mui/material';
import { useNavigate } from "react-router-dom";
import axios from 'axios';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const token = localStorage.getItem('token');
const url = process.env.REACT_APP_BASE_URL;

export default function Index() {
  const [users, setUsers] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const navigate = useNavigate();

  useEffect(() => {
    usersGet();  // Fetch users when component mounts
  }, []);

  const usersGet = () => {
    axios.get(`${url}/user`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    .then((response) => {
      setUsers(response.data);  // Set users data
    })
    .catch((error) => {
      console.error('Error fetching users', error);
    });
  };

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const ViewUser = (id) => {
    navigate(`/admin/user/view/${id}`);
  };

  const UpdateUser = (id) => {
    navigate(`/admin/user/update/${id}`);
  };

  const UserDelete = (id) => {
    axios.delete(`${url}/user/${id}`, {
      headers: {
        'Accept': 'application/form-data',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    .then((response) => {
      if (response.data.status) {
        showNotification(response.data.message, 'success');
        usersGet();  // Refresh users list after deletion
      } else {
        showNotification('Failed to delete user', 'error');
      }
    })
    .catch((error) => {
      const message = error.response?.data?.message || 'An error occurred while deleting user';
      showNotification(message, 'error');
      console.error('There was an error!', error);
    });
  };

  const UserBan = (id) => {
    axios.put(`${url}/user/ban/${id}`, null, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    .then((response) => {
      if (response.data.status) {
        showNotification(response.data.message, 'success');
        setUsers(prevUsers => prevUsers.map(user => user.userID === id ? { ...user, isActive: 0 } : user));
      } else {
        showNotification('Failed to suspend user', 'error');
      }
    })
    .catch((error) => {
      const message = error.response?.data?.message || 'An error occurred while suspending user';
      showNotification(message, 'error');
      console.error('Error suspending user:', error);
    });
  };

  const UserUnban = (id) => {
    axios.put(`${url}/user/unban/${id}`, null, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    .then((response) => {
      if (response.data.status) {
        showNotification(response.data.message, 'success');
        setUsers(prevUsers => prevUsers.map(user => user.userID === id ? { ...user, isActive: 1 } : user));
      } else {
        showNotification('Failed to unban user', 'error');
      }
    })
    .catch((error) => {
      const message = error.response?.data?.message || 'An error occurred while unbanning user';
      showNotification(message, 'error');
      console.error('Error unbanning user:', error);
    });
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8E9F0' }}>
      <Container sx={{ marginTop: 3 }} maxWidth="lg">
        <Paper sx={{ padding: 3, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #e0e0e0' }}>
          <Box display="flex" justifyContent="flex-start" alignItems="center" sx={{ mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon sx={{ fontSize: '20px', color: 'black' }} />}
              onClick={() => navigate('/dashboard')}
              sx={{ mr: 2, color: '#333', fontWeight: 'bold', fontSize: '18px' }}
            >
              จัดการข้อมูลผู้ใช้
            </Button>
          </Box>
          <TableContainer>
            <Table aria-label="simple table">
              <TableHead>
                <TableRow>
                  <TableCell align="right">รหัส</TableCell>
                  <TableCell align="center">รูป</TableCell>
                  <TableCell align="left">ชื่อ</TableCell>
                  <TableCell align="left">นามสกุล</TableCell>
                  <TableCell align="left">ชื่อผู้ใช้</TableCell>
                  <TableCell align="center">จัดการข้อมูล</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.userID}>
                    <TableCell align="right">{user.userID}</TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center">
                        <Avatar src={`${url}/user/image/${user.imageFile}`} sx={{ width: 56, height: 56 }} />
                      </Box>
                    </TableCell>
                    <TableCell align="left">{user.firstname}</TableCell>
                    <TableCell align="left">{user.lastname}</TableCell>
                    <TableCell align="left">{user.username}</TableCell>
                    <TableCell align="center">
                      <ButtonGroup>
                        <Button
                          variant="outlined"
                          onClick={() => ViewUser(user.userID)}
                          sx={{
                            color: '#555',
                            borderColor: '#e0e0e0',
                            '&:hover': {
                              backgroundColor: '#f0f4f8',
                            },
                          }}
                        >
                          ตรวจสอบรายงาน
                        </Button>

                        <Button
                          variant="outlined"
                          onClick={() => UpdateUser(user.userID)}
                          sx={{
                            color: '#555',
                            borderColor: '#e0e0e0',
                            '&:hover': {
                              backgroundColor: '#f0f4f8',
                            },
                          }}
                        >
                          แก้ไข
                        </Button>

                        <Button
                          variant="contained"
                          onClick={() => UserBan(user.userID)}
                          disabled={user.isActive === 0}
                          sx={{
                            color: '#fff',
                            backgroundColor: user.isActive === 0 ? '#ffb3b3' : '#ff6961',
                            '&:hover': {
                              backgroundColor: user.isActive === 0 ? '#ff6961' : '#ff4c4c',
                            },
                          }}
                        >
                          ระงับผู้ใช้
                        </Button>

                        <Button
                          variant="contained"
                          onClick={() => UserUnban(user.userID)}
                          disabled={user.isActive === 1}
                          sx={{
                            color: '#fff',
                            backgroundColor: user.isActive === 1 ? '#b3cde0' : '#4682b4',
                            '&:hover': {
                              backgroundColor: user.isActive === 1 ? '#4682b4' : '#5a9bd4',
                            },
                          }}
                        >
                          ปลดแบน
                        </Button>

                        <Button
                          variant="contained"
                          color="error"
                          onClick={() => UserDelete(user.userID)}
                          sx={{
                            backgroundColor: '#ffb3b3',
                            color: '#fff',
                            '&:hover': {
                              backgroundColor: '#ff4c4c',
                            },
                          }}
                        >
                          ลบผู้ใช้
                        </Button>
                      </ButtonGroup>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
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
  );
}

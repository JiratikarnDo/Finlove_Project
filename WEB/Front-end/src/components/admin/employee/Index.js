import React, { useEffect, useState } from "react";
import {
  Button, Container, Paper, Box, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Avatar, ButtonGroup
} from '@mui/material';
import { useNavigate } from "react-router-dom";
import axios from 'axios';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const token = localStorage.getItem('token');
const url = process.env.REACT_APP_BASE_URL;

export default function Index() {
  const [employees, setEmployees] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    employeesGet();
  }, []);

  const employeesGet = () => {
    axios.get(`${url}/employee`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    .then((response) => {
      setEmployees(response.data);
    })
    .catch((error) => {
      console.error('Error fetching employees', error);
    });
  };

  const ViewEmployee = (id) => {
    navigate(`/admin/employee/view/${id}`);
  }

  const UpdateEmployee = (id) => {
    navigate(`/admin/employee/update/${id}`);
  }

  const EmployeeDelete = (id) => {
    axios.delete(`${url}/employee/${id}`, {
      headers: {
        'Accept': 'application/form-data',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    .then((response) => {
      if (response.data.status === true) {
        alert(response.data.message);
        employeesGet();
      } else {
        alert('Failed to delete employee');
      }
    })
    .catch((error) => {
      console.error('There was an error!', error);
    });
  };

  const EmployeeBan = (id) => {
    axios.put(`${url}/employee/ban/${id}`, null, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    .then((response) => {
      if (response.data.status === true) {
        alert(response.data.message);
        employeesGet();
      } else {
        alert('Failed to suspend employee');
      }
    })
    .catch((error) => {
      console.error('Error suspending employee:', error);
    });
  };

  const EmployeeUnban = (id) => {
    axios.put(`${url}/employee/unban/${id}`, null, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    .then((response) => {
      if (response.data.status === true) {
        alert(response.data.message);
        employeesGet();
      } else {
        alert('Failed to unban employee');
      }
    })
    .catch((error) => {
      console.error('Error unbanning employee:', error);
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
              จัดการข้อมูลพนักงาน
            </Button>
          </Box>
          <TableContainer>
            <Table aria-label="employee table">
              <TableHead>
                <TableRow>
                  <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '16px' }}>รหัส</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '16px' }}>รูป</TableCell>
                  <TableCell align="left" sx={{ fontWeight: 'bold', fontSize: '16px' }}>ชื่อ</TableCell>
                  <TableCell align="left" sx={{ fontWeight: 'bold', fontSize: '16px' }}>นามสกุล</TableCell>
                  <TableCell align="left" sx={{ fontWeight: 'bold', fontSize: '16px' }}>ชื่อผู้ใช้</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '16px' }}>จัดการข้อมูล</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.empID}>
                    <TableCell align="right" sx={{ fontSize: '14px' }}>{employee.empID}</TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center">
                        <Avatar src={url + '/employee/image/' + employee.imageFile} sx={{ width: 56, height: 56 }} />
                      </Box>
                    </TableCell>
                    <TableCell align="left" sx={{ fontSize: '14px' }}>{employee.firstname}</TableCell>
                    <TableCell align="left" sx={{ fontSize: '14px' }}>{employee.lastname}</TableCell>
                    <TableCell align="left" sx={{ fontSize: '14px' }}>{employee.username}</TableCell>
                    <TableCell align="center">
                      <ButtonGroup>
                        <Button
                          variant="outlined"
                          onClick={() => ViewEmployee(employee.empID)}
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
                          onClick={() => UpdateEmployee(employee.empID)}
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
                          onClick={() => EmployeeBan(employee.empID)}
                          disabled={employee.isActive === 0}
                          sx={{
                            color: '#fff',
                            backgroundColor: employee.isActive === 0 ? '#ffb3b3' : '#ff6961',
                            '&:hover': {
                              backgroundColor: employee.isActive === 0 ? '#ff6961' : '#ff4c4c',
                            },
                          }}
                        >
                          ระงับผู้ใช้
                        </Button>

                        <Button
                          variant="contained"
                          onClick={() => EmployeeUnban(employee.empID)}
                          disabled={employee.isActive === 1}
                          sx={{
                            color: '#fff',
                            backgroundColor: employee.isActive === 1 ? '#b3cde0' : '#4682b4',
                            '&:hover': {
                              backgroundColor: employee.isActive === 1 ? '#4682b4' : '#5a9bd4',
                            },
                          }}
                        >
                          ปลดแบน
                        </Button>

                        <Button
                          variant="contained"
                          color="error"
                          onClick={() => EmployeeDelete(employee.empID)}
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
      </Container>
    </Box>
  );
}

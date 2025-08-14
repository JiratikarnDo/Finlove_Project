import React, { useState, useEffect } from 'react';
import { Button, TextField, Grid, Box, Typography, Container, createTheme, ThemeProvider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const token = localStorage.getItem('token');
const url = process.env.REACT_APP_BASE_URL;

const pinkTheme = createTheme({
  palette: {
    primary: {
      main: '#e91e63', // Pink color for primary elements
    },
    background: {
      default: '#fff0f5', // Light pink background
    },
  },
  typography: {
    h5: {
      fontSize: '1.8rem',
      fontWeight: 'bold',
      color: '#d81b60',
    },
    body1: {
      color: '#880e4f',
    },
  },
});

export default function EditEmployee() {
  const [empID, setEmpID] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phonenumber, setPhonenumber] = useState('');
  const [gender, setGender] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${url}/employee/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    .then(response => {
      const employee = response.data;
      setEmpID(employee.empID);
      setUsername(employee.username);
      setFirstName(employee.firstname || '');
      setLastName(employee.lastname || '');
      setEmail(employee.email);
      setPhonenumber(employee.phonenumber || '');
      setGender(employee.gender || '');
    })
    .catch(error => {
      console.error('Error fetching employee data:', error);
    });
  }, [id]);

  const handleImageChange = (e) => {
    setProfileImage(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('username', username);
    formData.append('firstname', firstName || '');
    formData.append('lastname', lastName || '');
    formData.append('email', email);
    formData.append('phonenumber', phonenumber);
    formData.append('gender', gender);

    if (profileImage) {
      formData.append('profileImage', profileImage);
    }

    try {
      const response = await axios.put(`${url}/employee/${id}`, formData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = response.data;
      if (result.status) {
        alert('บันทึกข้อมูลสำเร็จ');
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.message);
      }
    } catch (error) {
      if (error.response && error.response.status === 403) {
        alert('คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล');
      } else {
        console.error('Error submitting form:', error);
      }
    }
  };

  return (
    <ThemeProvider theme={pinkTheme}>
      <Container component="main" maxWidth="sm" sx={{ backgroundColor: '#fff', borderRadius: '15px', boxShadow: '0 4px 12px rgba(233, 30, 99, 0.2)', py: 4, px: 3, mt: 10 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box display="flex" alignItems="center" sx={{ alignSelf: 'flex-start', mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(-1)}
              sx={{ color: '#d81b60', fontWeight: 'bold', fontSize: '16px', mb: 2 }}
            >
              ย้อนกลับ
            </Button>
          </Box>
          <Typography component="h1" variant="h5" gutterBottom>
            แก้ไขข้อมูลพนักงาน
          </Typography>
          <Typography variant="body1" gutterBottom>
            รหัสพนักงาน: {empID}
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  id="username"
                  label="ชื่อผู้ใช้"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  InputLabelProps={{ style: { color: '#d81b60' } }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  id="firstname"
                  label="ชื่อ"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  InputLabelProps={{ style: { color: '#d81b60' } }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  id="lastname"
                  label="นามสกุล"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  InputLabelProps={{ style: { color: '#d81b60' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  id="email"
                  label="อีเมล"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  InputLabelProps={{ style: { color: '#d81b60' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  id="phonenumber"
                  label="เบอร์โทร"
                  value={phonenumber}
                  onChange={(e) => setPhonenumber(e.target.value)}
                  InputLabelProps={{ style: { color: '#d81b60' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  id="gender"
                  label="เพศ"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  InputLabelProps={{ style: { color: '#d81b60' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <input type="file" onChange={handleImageChange} style={{ color: '#d81b60', marginTop: '10px' }} />
              </Grid>
            </Grid>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ mt: 3, mb: 2, fontWeight: 'bold' }}
            >
              บันทึกข้อมูล
            </Button>
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

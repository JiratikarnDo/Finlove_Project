import React, { useState, useEffect } from 'react';
import { Button, TextField, Grid, Box, Typography, Container, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const token = localStorage.getItem('token');
const url = process.env.REACT_APP_BASE_URL;

export default function EditUser() {
  const [userID, setUserID] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${url}/profile/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
      const user = response.data;
      setUserID(user.userID);
      setUsername(user.username);
      setFirstName(user.firstname);
      setLastName(user.lastname);
      setEmail(user.email);
      setAddress(user.home);
      setPhoneNumber(user.phonenumber);
    })
    .catch(error => {
      console.error('Error fetching user data:', error);
    });
  }, [id]);

  const handleImageChange = (e) => {
    setProfileImage(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('username', username);
    formData.append('firstname', firstName);
    formData.append('lastname', lastName);
    formData.append('email', email);
    formData.append('home', address);
    formData.append('phonenumber', phoneNumber);

    if (profileImage) {
      formData.append('profileImage', profileImage);
    }

    try {
      const response = await axios.put(`${url}/user/${id}`, formData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const result = response.data;
      if (result.status) {
        alert('บันทึกข้อมูลสำเร็จ');
        navigate(-1); // ย้อนกลับไปหน้าก่อนหน้า
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
    <Container component="main" maxWidth="sm" sx={{ backgroundColor: '#F9FAFB', borderRadius: 4, padding: 4, boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)', mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon sx={{ color: '#333' }} />
        </IconButton>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold', ml: 2 }}>
          แก้ไขข้อมูลผู้ใช้
        </Typography>
      </Box>

      <Typography variant="body1" color="textSecondary" gutterBottom>
        รหัสผู้ใช้: {userID}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              required
              fullWidth
              id="username"
              label="ชื่อผู้ใช้"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ backgroundColor: '#fff', borderRadius: 2 }}
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
              sx={{ backgroundColor: '#fff', borderRadius: 2 }}
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
              sx={{ backgroundColor: '#fff', borderRadius: 2 }}
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
              sx={{ backgroundColor: '#fff', borderRadius: 2 }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              id="address"
              label="ที่อยู่"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              sx={{ backgroundColor: '#fff', borderRadius: 2 }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              id="phoneNumber"
              label="เบอร์โทร"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              sx={{ backgroundColor: '#fff', borderRadius: 2 }}
            />
          </Grid>
          <Grid item xs={12}>
            <input type="file" onChange={handleImageChange} />
          </Grid>
        </Grid>
        
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 4, mb: 2, backgroundColor: '#4CAF50', color: '#fff', fontWeight: 'bold', borderRadius: 2, '&:hover': { backgroundColor: '#45a049' } }}
        >
          บันทึกข้อมูล
        </Button>
      </Box>
    </Container>
  );
}

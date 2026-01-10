import logging
import os

from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.template.loader import render_to_string
from django.core.exceptions import ValidationError

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from users.permissions import IsAdminOrStaff, IsAdmin

from .models import (
    Company, CompanyInvitation, Form, Feedback, BasicData, Address,
    StandDetails, Stand, EquipmentItem, EquipmentSelection, Workshop, Jobwall,
    Description, FinalData, Lunch, PDI, PDIAttendee, Exhibitor, Settings,
)
from .serializers import (
    CompanySerializer, CompanyInvitationSerializer, CompanyRegistrationSerializer,
    FormSerializer, FeedbackSerializer, BasicDataSerializer, AddressSerializer,
    StandDetailsSerializer, EquipmentItemSerializer, EquipmentSelectionSerializer,
    WorkshopSerializer, JobwallSerializer,
    DescriptionSerializer, FinalDataSerializer, LunchSerializer,
    PDISerializer, PDIAttendeeSerializer, ExhibitorSerializer,
    Stage1Serializer, Stage2Serializer, Stage4Serializer, Stage5Serializer,
)

logger = logging.getLogger(__name__)


def validate_company_id(company_id):
    """Validate that company_id is a valid integer."""
    try:
        return int(company_id)
    except (ValueError, TypeError):
        raise ValidationError("company_id must be a valid integer")


def validate_stage_num(stage_num):
    """Validate that stage_num is between 1 and 5."""
    try:
        stage = int(stage_num)
        if stage not in [1, 2, 3, 4, 5]:
            raise ValidationError("stage_num must be between 1 and 5")
        return stage
    except (ValueError, TypeError):
        raise ValidationError("stage_num must be a valid integer")


def get_latest_feedback(company, stage_num):
    """Get the latest feedback for a stage, or None if it doesn't exist."""
    try:
        feedback = Feedback.objects.filter(
            company=company,
            form=f'stage_{stage_num}'
        ).order_by('-id').first()
        return feedback
    except Exception:
        return None


def create_or_update_feedback(company, stage_num, feedback_status='pending', comment=''):
    """Create or update feedback for a stage."""
    feedback, created = Feedback.objects.update_or_create(
        company=company,
        form=f'stage_{stage_num}',
        defaults={
            'status': feedback_status,
            'comment': comment,
        }
    )
    return feedback

# --- COMPANY VIEWS ---
class CompanyListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    """
    List all companies or create a new company.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        companies = Company.objects.all()
        serializer = CompanySerializer(companies, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        serializer = CompanySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CompanyDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    """
    Retrieve, update or delete a company instance.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, id):
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving the company"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = CompanySerializer(company)
        return Response(serializer.data)
    
    def put(self, request, id):
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.put: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating the company"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = CompanySerializer(company, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, id):
        """
        Update stands for a company. Accepts day1_stand and day2_stand data.
        """
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stands"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Track if stands were changed to send email
        stands_changed = False
        
        # Get existing stands before update
        existing_day1 = Stand.objects.filter(company=company, day='day1').first()
        existing_day2 = Stand.objects.filter(company=company, day='day2').first()
        
        # Handle stand updates
        day1_stand_data = request.data.get('day1_stand')
        day2_stand_data = request.data.get('day2_stand')
        
        if day1_stand_data is not None:
            if day1_stand_data.get('stand_number') and day1_stand_data.get('stand_size'):
                # Validate stand_number length (2-3 characters)
                stand_number = day1_stand_data.get('stand_number').strip()
                if len(stand_number) < 2 or len(stand_number) > 3:
                    return Response(
                        {"detail": "Stand number must be 2-3 characters"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                # Validate stand_size
                valid_sizes = ['podstawowy', 'standardowy', 'rozszerzony']
                if day1_stand_data.get('stand_size') not in valid_sizes:
                    return Response(
                        {"detail": f"Stand size must be one of: {', '.join(valid_sizes)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                # Check if stand actually changed
                if not existing_day1 or existing_day1.stand_number != stand_number or existing_day1.stand_size != day1_stand_data.get('stand_size'):
                    Stand.objects.update_or_create(
                        company=company,
                        day='day1',
                        defaults={
                            'stand_number': stand_number,
                            'stand_size': day1_stand_data.get('stand_size')
                        }
                    )
                    stands_changed = True
            elif day1_stand_data is None or (not day1_stand_data.get('stand_number') and not day1_stand_data.get('stand_size')):
                # Delete stand if both fields are empty/None
                if existing_day1:
                    Stand.objects.filter(company=company, day='day1').delete()
                    stands_changed = True
        
        if day2_stand_data is not None:
            if day2_stand_data.get('stand_number') and day2_stand_data.get('stand_size'):
                # Validate stand_number length (2-3 characters)
                stand_number = day2_stand_data.get('stand_number').strip()
                if len(stand_number) < 2 or len(stand_number) > 3:
                    return Response(
                        {"detail": "Stand number must be 2-3 characters"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                # Validate stand_size
                valid_sizes = ['podstawowy', 'standardowy', 'rozszerzony']
                if day2_stand_data.get('stand_size') not in valid_sizes:
                    return Response(
                        {"detail": f"Stand size must be one of: {', '.join(valid_sizes)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                # Check if stand actually changed
                if not existing_day2 or existing_day2.stand_number != stand_number or existing_day2.stand_size != day2_stand_data.get('stand_size'):
                    Stand.objects.update_or_create(
                        company=company,
                        day='day2',
                        defaults={
                            'stand_number': stand_number,
                            'stand_size': day2_stand_data.get('stand_size')
                        }
                    )
                    stands_changed = True
            elif day2_stand_data is None or (not day2_stand_data.get('stand_number') and not day2_stand_data.get('stand_size')):
                # Delete stand if both fields are empty/None
                if existing_day2:
                    Stand.objects.filter(company=company, day='day2').delete()
                    stands_changed = True
        
        # Send email notification if stands were changed
        if stands_changed:
            logger.info(f"Stand assignment changed for company {company.id}, sending email notification")
            try:
                self._send_stand_assignment_email(company)
                logger.info(f"Stand assignment email sent successfully for company {company.id}")
            except Exception as e:
                logger.error(f"Error sending stand assignment email for company {company.id}: {e}", exc_info=True)
                # Don't fail the request if email fails
        else:
            logger.info(f"No stand changes detected for company {company.id}")
        
        # Return updated company data
        serializer = CompanySerializer(company)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def _send_stand_assignment_email(self, company):
        """Send email notification when stand assignment is updated"""
        # Get company representative
        representative = company.representative
        if not representative or not representative.email:
            logger.warning(f"No representative email found for company {company.id}")
            return
        
        logger.info(f"Sending stand assignment email to {representative.email} for company {company.id}")
        
        # Get language preference (default to Polish)
        language = getattr(representative, 'language', 'pl') or 'pl'
        if language not in ['en', 'pl']:
            language = 'pl'
        
        # Get current stand assignments
        day1_stand = Stand.objects.filter(company=company, day='day1').first()
        day2_stand = Stand.objects.filter(company=company, day='day2').first()
        
        # Stand size display mapping
        size_display = {
            'podstawowy': {'en': '4m²', 'pl': '4m²'},
            'standardowy': {'en': '6m²', 'pl': '6m²'},
            'rozszerzony': {'en': '8m²', 'pl': '8m²'},
        }
        
        # Prepare stand data for template
        day1_stand_data = None
        day2_stand_data = None
        
        if day1_stand:
            day1_stand_data = {
                'stand_number': day1_stand.stand_number,
                'stand_size_display': size_display.get(day1_stand.stand_size, {}).get(language, day1_stand.stand_size)
            }
        
        if day2_stand:
            day2_stand_data = {
                'stand_number': day2_stand.stand_number,
                'stand_size_display': size_display.get(day2_stand.stand_size, {}).get(language, day2_stand.stand_size)
            }
        
        # Dashboard link
        dashboard_link = f"{settings.FRONTEND_BASE_URL}/panel/exhibitor"
        
        # Use backend URL for static files (logo is hosted on backend)
        backend_url = os.environ.get('BACKEND_BASE_URL', 'http://localhost:8000')
        logo_url = f"{backend_url}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"
        
        # Select template based on language
        template_name = f"emails/stand_assigned_{language}.html"
        if language == 'en':
            subject = "Stand Assignment Update - ITP System"
        else:
            subject = "Aktualizacja przypisania stoiska - ITP System"
        
        # Get staff contact email (fr_resp) or default
        staff_email = None
        if company.fr_resp and company.fr_resp.email:
            staff_email = company.fr_resp.email
        default_email = 'best@best.pw.edu.pl'
        
        # Build contact text for plain messages
        if staff_email:
            contact_text_en = f' your staff contact at {staff_email} or us at {default_email}'
            contact_text_pl = f' ze swoim opiekunem pod adresem {staff_email} lub z nami pod adresem {default_email}'
        else:
            contact_text_en = f' us at {default_email}'
            contact_text_pl = f' z nami pod adresem {default_email}'
        
        # Plain text message
        if language == 'en':
            plain_message = f"""Hello {representative.username or representative.email},

Your stand assignment for {company.name} has been updated.

"""
            if day1_stand_data:
                plain_message += f"Day 1 Stand (March 10, 2025):\nStand Number: {day1_stand_data['stand_number']}\nSize: {day1_stand_data['stand_size_display']}\n\n"
            if day2_stand_data:
                plain_message += f"Day 2 Stand (March 11, 2025):\nStand Number: {day2_stand_data['stand_number']}\nSize: {day2_stand_data['stand_size_display']}\n\n"
            if not day1_stand_data and not day2_stand_data:
                plain_message += "Your stand assignments have been removed.\n\n"
            
            plain_message += f"""You can view your stand information and other company details in your dashboard: {dashboard_link}

If you have any questions, please contact{contact_text_en}."""
        else:
            plain_message = f"""Cześć {representative.username or representative.email},

Twoje przypisanie stoiska dla {company.name} zostało zaktualizowane.

"""
            if day1_stand_data:
                plain_message += f"Stoisko dzień 1 (10.03.2025):\nNumer stoiska: {day1_stand_data['stand_number']}\nRozmiar: {day1_stand_data['stand_size_display']}\n\n"
            if day2_stand_data:
                plain_message += f"Stoisko dzień 2 (11.03.2025):\nNumer stoiska: {day2_stand_data['stand_number']}\nRozmiar: {day2_stand_data['stand_size_display']}\n\n"
            if not day1_stand_data and not day2_stand_data:
                plain_message += "Twoje przypisania stoisk zostały usunięte.\n\n"
            
            plain_message += f"""Możesz zobaczyć informacje o swoim stoisku i inne szczegóły firmy w panelu: {dashboard_link}

Jeśli masz pytania, skontaktuj się{contact_text_pl}."""
        
        # Render HTML template
        try:
            html_content = render_to_string(template_name, {
                'company_name': company.name,
                'day1_stand': day1_stand_data,
                'day2_stand': day2_stand_data,
                'dashboard_link': dashboard_link,
                'logo_url': logo_url,
                'staff_email': staff_email,
                'default_email': default_email,
            })
            logger.info(f"Email template '{template_name}' rendered successfully")
        except Exception as e:
            logger.error(f"Error rendering email template '{template_name}': {e}", exc_info=True)
            raise
        
        # Send email with HTML and plain text alternatives
        try:
            email_message = EmailMultiAlternatives(
                subject=subject,
                body=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[representative.email],
            )
            email_message.attach_alternative(html_content, "text/html")
            email_message.send(fail_silently=False)
            logger.info(f"Email sent successfully to {representative.email}")
        except Exception as e:
            logger.error(f"Error sending email to {representative.email}: {e}", exc_info=True)
            raise
    
    def delete(self, request, id):
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.delete: {e}", exc_info=True)
            return Response({"detail": "An error occurred while deleting the company"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        company.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CompanyInvitationListView(APIView):
    """
    List all company invitations.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    
    def get(self, request):
        invitations = CompanyInvitation.objects.all().order_by('-created_at')
        serializer = CompanyInvitationSerializer(invitations, many=True)
        return Response(serializer.data)


class CompanyInvitationDetailView(APIView):
    """
    Retrieve a single company invitation by ID.
    """
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    
    def get(self, request, id):
        try:
            validate_company_id(id)
            invitation = CompanyInvitation.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except CompanyInvitation.DoesNotExist:
            return Response({"detail": "Invitation not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyInvitationDetailView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving the invitation"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = CompanyInvitationSerializer(invitation)
        return Response(serializer.data)


class CompanyInvitationView(generics.CreateAPIView):
    serializer_class = CompanyInvitationSerializer
    queryset = CompanyInvitation.objects.all()
    permission_classes = [IsAuthenticated, IsAdminOrStaff]

    def perform_create(self, serializer):
        # Set the creator to the current user (staff member who created the invitation)
        invitation = serializer.save(created_by=self.request.user)
        
        # Get language from invitation model (default to English)
        language = invitation.language or 'en'
        if language not in ['en', 'pl']:
            language = 'en'
        
        # Get registration link with language parameter
        registration_link = f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}&lang={language}"
        # Use backend URL for static files (logo is hosted on backend)
        backend_url = os.environ.get('BACKEND_BASE_URL', 'http://localhost:8000')
        logo_url = f"{backend_url}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"

        # Select template based on language
        template_name = f"emails/invitation_{language}.html"

        # Subject and plain text based on language
        if language == 'pl':
            subject = "Zaproszenie do firmy - ITP System"
            plain_message = f"""Zostałeś zaproszony do platformy dla wystawców Inżynierkisch targów Pracy. 
                            Twój unikalny login: 
                            {invitation.company_name}
                            Aby dokończyć rejestrację, kliknij poniższy link i ustaw hasło:
                            {registration_link}
                            Link do zaproszenia wygaśnie za 7 dni.
                            Jeśli nie spodziewałeś się tego zaproszenia, możesz zignorować tę wiadomość."""
        else:
            subject = "Company Invitation - ITP System"
            plain_message = f"""You have been invited to join the ITP System platform for exhibitors of the Engineering Job Fair.
                            Your unique login: 
                            {invitation.company_name}
                            To complete your registration, click the link below and set your password:
                            {registration_link}
                            This invitation link will expire in 7 days.
                            If you did not expect this invitation, you can safely ignore this email."""

        # Get staff contact email (fr_resp) or default
        # First, try to get from the user who created the invitation
        staff_email = None
        default_email = 'best@best.pw.edu.pl'
        if invitation.created_by and invitation.created_by.email:
            staff_email = invitation.created_by.email
        else:
            # If not available from creator, try to get from existing company (if it exists)
            try:
                existing_company = Company.objects.get(name=invitation.company_name)
                if existing_company.fr_resp and existing_company.fr_resp.email:
                    staff_email = existing_company.fr_resp.email
            except Company.DoesNotExist:
                pass  # Company doesn't exist yet, which is expected for new invitations
        
        # Render HTML template
        html_content = render_to_string(template_name, {
            'company_name': invitation.company_name,
            'registration_link': registration_link,
            'logo_url': logo_url,
            'staff_email': staff_email,
            'default_email': default_email,
        })

        # Send email with HTML and plain text alternatives
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[invitation.email],
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()


class CompanyRegistrationView(APIView):
    authentication_classes = []
    permission_classes = []
    
    def get(self, request, *args, **kwargs):
        token = request.query_params.get("token")
        if not token:
            return Response({"detail": "Token parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            invitation = CompanyInvitation.objects.get(token=token, is_accepted=False)
            if invitation.is_expired():
                return Response({"detail": "Invitation has expired"}, status=status.HTTP_400_BAD_REQUEST)
            return Response({
                "company_name": invitation.company_name,
                "username": invitation.company_name,
                "email": invitation.email,
                "company_status": invitation.company_status
            })
        except CompanyInvitation.DoesNotExist:
            return Response({"detail": "Invalid or already used invitation token"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyRegistrationView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while processing the invitation"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, *args, **kwargs):
        token = request.data.get("token")
        if not token:
            return Response({"detail": "Token is required"}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data.copy()
        serializer = CompanyRegistrationSerializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response({"message": "Company registration successful"}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Error in CompanyRegistrationView.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred during registration"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# FORMS
class FormStage1View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            # Allow access for company representative or staff/admin
            if company.representative != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_403_FORBIDDEN)
            basic_data = BasicData.objects.filter(company=company).first()
            if not basic_data:
                return Response({
                    'basic_data': None,
                    'address': None,
                })
            address = Address.objects.filter(form=basic_data).first()
            return Response({
                'basic_data': BasicDataSerializer(basic_data).data,
                'address': AddressSerializer(address).data if address else None,
            })
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage1View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 1 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage1View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 1 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        form, _ = Form.objects.get_or_create(company=company)
        data = request.data.copy()
        if 'basic_data' in data:
            data['basic_data']['company'] = company.id
        serializer = Stage1Serializer(data=data)
        if serializer.is_valid():
            serializer.save()
            # Create feedback with pending status
            create_or_update_feedback(company, 1, 'pending', '')
            # Reset completion flag when creating new submission
            form.stage_1_completed = False
            form.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            basic_data = BasicData.objects.get(company=company)
            address = Address.objects.filter(form=basic_data).first()
            
            # Check feedback status
            latest_feedback = get_latest_feedback(company, 1)
            # If stage was accepted and user is editing, cancel the acceptance by resetting feedback
            if latest_feedback and latest_feedback.status == 'accepted':
                form.stage_1_completed = False
                form.save()
                # Reset feedback status to pending to cancel the acceptance
                create_or_update_feedback(company, 1, 'pending', '')
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except BasicData.DoesNotExist:
            return Response({"detail": "Basic data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage1View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 1 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Remove company field from request data for PATCH (it's a OneToOneField and shouldn't change)
        data = request.data.copy()
        if 'basic_data' in data and 'company' in data['basic_data']:
            del data['basic_data']['company']
        
        serializer = Stage1Serializer(
            {'basic_data': basic_data, 'address': address},
            data=data,
            partial=True
        )
        if serializer.is_valid():
            serializer.save()
            # Create or update feedback with pending status
            create_or_update_feedback(company, 1, 'pending', '')
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class EquipmentItemsView(APIView):
    """
    Get all active equipment items with prices.
    Public endpoint for fetching equipment catalog.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            equipment_items = EquipmentItem.objects.filter(is_active=True).order_by('category', 'name_en')
            serializer = EquipmentItemSerializer(equipment_items, many=True, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in EquipmentItemsView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving equipment items"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class FormStage2View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            # Allow access for company representative or staff/admin
            if company.representative != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_403_FORBIDDEN)
            stand = StandDetails.objects.filter(company=company).first()
            if not stand:
                return Response({
                    'stand_details': None,
                    'equipment_selections': [],
                })
            equipment_selections = EquipmentSelection.objects.filter(stand_details=stand)
            # Debug logging
            logger.info(f"GET stage 2: Company {company_id}, Stand ID: {stand.id}, Equipment selections count: {equipment_selections.count()}")
            serialized_selections = EquipmentSelectionSerializer(equipment_selections, many=True, context={'request': request}).data
            logger.info(f"Serialized equipment selections: {serialized_selections}")
            return Response({
                'stand_details': StandDetailsSerializer(stand).data,
                'equipment_selections': serialized_selections,
            })
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage2View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 2 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            # Check if stage 1 data exists (not if it's approved)
            if not BasicData.objects.filter(company=company).exists():
                return Response({"detail": "Stage 1 must be completed before accessing stage 2"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage2View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 2 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # DRF's MultiPartParser may or may not parse bracket notation
        # Check all keys to see what we're dealing with
        logger.info(f"request.data type: {type(request.data)}")
        all_keys = list(request.data.keys()) if hasattr(request.data, 'keys') else []
        logger.info(f"All request.data keys: {all_keys}")
        
        # Debug: log all items to see the actual structure
        if hasattr(request.data, 'items'):
            logger.info("All request.data items:")
            for k, v in request.data.items():
                logger.info(f"  {k}: {v} (type: {type(v)})")
        
        # DRF's MultiPartParser doesn't automatically parse bracket notation
        # We need to parse all keys manually
        stand_details_dict = {}
        
        # Parse all keys that start with 'stand_details['
        bracket_keys = [k for k in all_keys if k.startswith('stand_details[')]
        logger.info(f"Found bracket notation keys: {bracket_keys}")
        
        for key in bracket_keys:
            field_name = key.replace('stand_details[', '').replace(']', '')
            # Skip file fields - they should come from request.FILES, not request.data
            if field_name in ['logo_sign_file', 'fire_cert']:
                continue
            value = request.data.get(key)
            # Handle QueryDict - get first value if it's a list
            if isinstance(value, list) and len(value) > 0:
                value = value[0]
            stand_details_dict[field_name] = value
            logger.info(f"Parsed: stand_details[{field_name}] = {value}")
        
        # If no bracket keys found, try accessing 'stand_details' directly (DRF might have parsed it)
        if not bracket_keys and 'stand_details' in request.data:
            stand_details_raw = request.data['stand_details']
            logger.info(f"Found 'stand_details' key (no bracket keys), type: {type(stand_details_raw)}")
            logger.info(f"Content: {stand_details_raw}")
            logger.info(f"Has 'keys' method: {hasattr(stand_details_raw, 'keys')}")
            if hasattr(stand_details_raw, 'keys'):
                logger.info(f"Keys in stand_details_raw: {list(stand_details_raw.keys())}")
            
            if isinstance(stand_details_raw, dict):
                # Extract dict but skip file fields (they come from request.FILES)
                stand_details_dict = {k: v for k, v in stand_details_raw.items() if k not in ['logo_sign_file', 'fire_cert']}
                logger.info(f"Extracted as dict: {stand_details_dict}")
            elif hasattr(stand_details_raw, 'dict'):
                # Extract dict but skip file fields
                raw_dict = stand_details_raw.dict()
                stand_details_dict = {k: v for k, v in raw_dict.items() if k not in ['logo_sign_file', 'fire_cert']}
                logger.info(f"Extracted via .dict(): {stand_details_dict}")
            elif hasattr(stand_details_raw, 'keys'):
                for k in stand_details_raw.keys():
                    v = stand_details_raw.get(k)
                    if isinstance(v, list) and len(v) > 0:
                        v = v[0]
                    stand_details_dict[k] = v
                logger.info(f"Extracted via iteration: {stand_details_dict}")
        
        # Debug: log what we have so far
        logger.info(f"stand_details_dict after parsing: {stand_details_dict}")
        
        # Merge files from request.FILES into stand_details
        logger.info(f"request.FILES keys: {list(request.FILES.keys())}")
        for key, file in request.FILES.items():
            logger.info(f"Processing file key: {key}, file name: {file.name if hasattr(file, 'name') else 'N/A'}")
            if key.startswith('stand_details['):
                field_name = key.replace('stand_details[', '').replace(']', '')
                stand_details_dict[field_name] = file
                logger.info(f"Parsed file stand_details[{field_name}] = {file.name if hasattr(file, 'name') else file}")
            else:
                # Also check if it's a direct file field name
                if key in ['logo_sign_file', 'fire_cert']:
                    stand_details_dict[key] = file
                    logger.info(f"Parsed direct file field {key} = {file.name if hasattr(file, 'name') else file}")
        
        # Ensure all files from request.FILES are properly in stand_details_dict
        # Double-check to make sure files weren't missed
        for key, file_obj in request.FILES.items():
            if key.startswith('stand_details['):
                field_name = key.replace('stand_details[', '').replace(']', '')
                if field_name in ['logo_sign_file', 'fire_cert']:
                    stand_details_dict[field_name] = file_obj
                    logger.info(f"Ensured file {field_name} is in stand_details_dict: {file_obj.name if hasattr(file_obj, 'name') else 'file object'}")
            elif key in ['logo_sign_file', 'fire_cert']:
                stand_details_dict[key] = file_obj
                logger.info(f"Ensured file {key} is in stand_details_dict: {file_obj.name if hasattr(file_obj, 'name') else 'file object'}")
        
        # Add company to stand_details
        stand_details_dict['company'] = company.id
        
        # Parse equipment_selections - parse bracket notation from FormData
        equipment_selections_list = []
        # Always parse bracket notation manually since FormData uses bracket notation
        import re
        bracket_keys_found = False
        for key in request.data.keys():
            if key.startswith('equipment_selections['):
                bracket_keys_found = True
                match = re.match(r'equipment_selections\[(\d+)\]\[(\w+)\]', key)
                if match:
                    index = int(match.group(1))
                    field = match.group(2)
                    value = request.data.get(key)
                    if isinstance(value, list) and len(value) > 0:
                        value = value[0]
                    # Convert to integer for equipment_item and quantity fields
                    if field in ['equipment_item', 'quantity']:
                        try:
                            value = int(value)
                        except (ValueError, TypeError):
                            logger.error(f"Failed to convert {field} to int: {value}")
                            continue
                    while len(equipment_selections_list) <= index:
                        equipment_selections_list.append({})
                    equipment_selections_list[index][field] = value
        
        # Fallback: if no bracket keys found, check if DRF parsed it as a list
        if not bracket_keys_found and 'equipment_selections' in request.data:
            equipment_selections_raw = request.data['equipment_selections']
            logger.info(f"Fallback: request.data['equipment_selections'] type: {type(equipment_selections_raw)}")
            if isinstance(equipment_selections_raw, list):
                # Ensure values are integers
                for item in equipment_selections_raw:
                    processed_item = {}
                    for key, value in item.items():
                        if key in ['equipment_item', 'quantity']:
                            try:
                                processed_item[key] = int(value)
                            except (ValueError, TypeError):
                                logger.error(f"Failed to convert {key} to int: {value}")
                        else:
                            processed_item[key] = value
                    equipment_selections_list.append(processed_item)
        
        logger.info(f"Parsed equipment_selections_list (count: {len(equipment_selections_list)}): {equipment_selections_list}")
        
        # Build data structure
        data = {
            'stand_details': stand_details_dict,
        }
        if equipment_selections_list:
            data['equipment_selections'] = equipment_selections_list
        
        logger.info(f"Final stand_details_dict: {stand_details_dict}")
        logger.info(f"Final equipment_selections_list: {equipment_selections_list}")
        logger.info(f"Parsed FormData for stage 2: {data}")
        
        # Validate that stand_type is present
        if 'stand_type' not in stand_details_dict or not stand_details_dict.get('stand_type'):
            logger.error(f"Missing stand_type in stand_details_dict: {stand_details_dict}")
            logger.error(f"All request.data keys: {list(request.data.keys())}")
            return Response({
                "detail": "Stand type is required. Please select 'Provided Stand' or 'Self Construction'."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate conditional requirements
        stand_details_data = data.get('stand_details', {})
        stand_type = stand_details_data.get('stand_type')
        
        # Note: This is a POST request (creating new), so is_update is False
        is_update = False
        
        # Validate conditional requirements - files should already be in stand_details_dict
        if stand_type == 'self_construction':
            # Check if fire_cert exists - check both stand_details_dict and request.FILES
            has_fire_cert = False
            # First check if it's already in stand_details_dict as a file object
            fire_cert_in_dict = stand_details_dict.get('fire_cert')
            if fire_cert_in_dict and (hasattr(fire_cert_in_dict, 'read') or hasattr(fire_cert_in_dict, 'name')):
                has_fire_cert = True
                logger.info(f"Found fire_cert in stand_details_dict: {fire_cert_in_dict.name if hasattr(fire_cert_in_dict, 'name') else 'file object'}")
            
            # If not found, check request.FILES directly
            if not has_fire_cert:
                for key in request.FILES.keys():
                    if 'fire_cert' in key:
                        has_fire_cert = True
                        logger.info(f"Found fire_cert in request.FILES: {key}")
                        # Add it to stand_details_dict
                        stand_details_dict['fire_cert'] = request.FILES[key]
                        break
            
            if not is_update and not has_fire_cert:
                logger.error(f"Fire cert validation failed. stand_details_dict keys: {list(stand_details_dict.keys())}, request.FILES keys: {list(request.FILES.keys())}")
                return Response({
                    "detail": "Fire certificate is required for self construction"
                }, status=status.HTTP_400_BAD_REQUEST)
        elif stand_type == 'provided_stand':
            if not stand_details_data.get('name_sign_text'):
                return Response({
                    "detail": "Name sign text is required for our stand"
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if logo_sign_file exists - check both stand_details_dict and request.FILES
            has_logo = False
            # First check if it's already in stand_details_dict as a file object
            logo_in_dict = stand_details_dict.get('logo_sign_file')
            if logo_in_dict and (hasattr(logo_in_dict, 'read') or hasattr(logo_in_dict, 'name')):
                has_logo = True
                logger.info(f"Found logo_sign_file in stand_details_dict: {logo_in_dict.name if hasattr(logo_in_dict, 'name') else 'file object'}")
            
            # If not found, check request.FILES directly
            if not has_logo:
                for key in request.FILES.keys():
                    if 'logo_sign_file' in key:
                        has_logo = True
                        logger.info(f"Found logo_sign_file in request.FILES: {key}")
                        # Add it to stand_details_dict
                        stand_details_dict['logo_sign_file'] = request.FILES[key]
                        break
            
            if not is_update and not has_logo:
                logger.error(f"Logo validation failed. stand_details_dict keys: {list(stand_details_dict.keys())}, request.FILES keys: {list(request.FILES.keys())}")
                return Response({
                    "detail": "Logo file is required for our stand"
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update data structure with stand_details_dict (files should now be included)
        data['stand_details'] = stand_details_dict
        if equipment_selections_list:
            data['equipment_selections'] = equipment_selections_list
        
        logger.info(f"Data before serializer: stand_details keys={list(stand_details_dict.keys())}")
        logger.info(f"File objects: logo={type(stand_details_dict.get('logo_sign_file'))}, fire_cert={type(stand_details_dict.get('fire_cert'))}")
        logger.info(f"Has logo file: {bool(stand_details_dict.get('logo_sign_file'))}, Has fire_cert: {bool(stand_details_dict.get('fire_cert'))}")
        serializer = Stage2Serializer(data=data)
        if serializer.is_valid():
            result = serializer.save()
            # Create feedback with pending status
            create_or_update_feedback(company, 2, 'pending', '')
            # Reset completion flag when creating new submission
            form.stage_2_completed = False
            form.save()
            
            # Return serialized response
            response_data = {
                'stand_details': StandDetailsSerializer(result['stand_details']).data,
                'equipment_selections': EquipmentSelectionSerializer(result['equipment_selections'], many=True, context={'request': request}).data,
            }
            return Response(response_data, status=status.HTTP_201_CREATED)
        logger.error(f"Serializer errors: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            stand = StandDetails.objects.get(company=company)
            equipment_selections = list(EquipmentSelection.objects.filter(stand_details=stand))
            
            # Check feedback status
            latest_feedback = get_latest_feedback(company, 2)
            # If stage was accepted and user is editing, cancel the acceptance by resetting feedback
            if latest_feedback and latest_feedback.status == 'accepted':
                form.stage_2_completed = False
                form.save()
                # Reset feedback status to pending to cancel the acceptance
                create_or_update_feedback(company, 2, 'pending', '')
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except StandDetails.DoesNotExist:
            return Response({"detail": "Stand details not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage2View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 2 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Parse FormData for PATCH (same as POST)
        # DRF's MultiPartParser may or may not parse bracket notation
        all_keys = list(request.data.keys()) if hasattr(request.data, 'keys') else []
        stand_details_dict = {}
        
        # Parse bracket notation keys
        bracket_keys = [k for k in all_keys if k.startswith('stand_details[')]
        for key in bracket_keys:
            field_name = key.replace('stand_details[', '').replace(']', '')
            value = request.data.get(key)
            if isinstance(value, list) and len(value) > 0:
                value = value[0]
            stand_details_dict[field_name] = value
        
        # If no bracket keys, try direct access
        if not bracket_keys and 'stand_details' in request.data:
            stand_details_raw = request.data['stand_details']
            if isinstance(stand_details_raw, dict):
                stand_details_dict = dict(stand_details_raw)
            elif hasattr(stand_details_raw, 'dict'):
                stand_details_dict = stand_details_raw.dict()
            elif hasattr(stand_details_raw, 'keys'):
                for k in stand_details_raw.keys():
                    v = stand_details_raw.get(k)
                    if isinstance(v, list) and len(v) > 0:
                        v = v[0]
                    stand_details_dict[k] = v
        
        # Merge files from request.FILES
        for key, file in request.FILES.items():
            if key.startswith('stand_details['):
                field_name = key.replace('stand_details[', '').replace(']', '')
                stand_details_dict[field_name] = file
            elif key in ['logo_sign_file', 'fire_cert']:
                stand_details_dict[key] = file
        
        # Parse equipment_selections - parse bracket notation from FormData
        equipment_selections_list = []
        import re
        for key in request.data.keys():
            if key.startswith('equipment_selections['):
                match = re.match(r'equipment_selections\[(\d+)\]\[(\w+)\]', key)
                if match:
                    index = int(match.group(1))
                    field = match.group(2)
                    value = request.data.get(key)
                    if isinstance(value, list) and len(value) > 0:
                        value = value[0]
                    # Convert to integer for equipment_item and quantity fields
                    if field in ['equipment_item', 'quantity']:
                        try:
                            value = int(value)
                        except (ValueError, TypeError):
                            logger.error(f"Failed to convert {field} to int: {value}")
                            continue
                    while len(equipment_selections_list) <= index:
                        equipment_selections_list.append({})
                    equipment_selections_list[index][field] = value
        
        # Build data structure
        data = {
            'stand_details': stand_details_dict,
        }
        if equipment_selections_list:
            data['equipment_selections'] = equipment_selections_list
        
        # Remove company field (it's a OneToOneField and shouldn't change)
        if 'company' in stand_details_dict:
            del stand_details_dict['company']
        
        # Validate conditional requirements for updates
        stand_details_data = data.get('stand_details', {})
        stand_type = stand_details_data.get('stand_type') or stand.stand_type
        
        if stand_type == 'self_construction':
            # Check if fire_cert exists in parsed data, request.FILES, or already in database
            has_fire_cert = stand_details_data.get('fire_cert') is not None or stand.fire_cert
            if not has_fire_cert:
                has_fire_cert = any('fire_cert' in key for key in list(request.FILES.keys()))
            if not has_fire_cert:
                return Response({
                    "detail": "Fire certificate is required for self construction"
                }, status=status.HTTP_400_BAD_REQUEST)
        elif stand_type == 'provided_stand':
            if not stand_details_data.get('name_sign_text') and not stand.name_sign_text:
                return Response({
                    "detail": "Name sign text is required for our stand"
                }, status=status.HTTP_400_BAD_REQUEST)
            # Check if logo_sign_file exists in parsed data, request.FILES, or already in database
            has_logo = stand_details_data.get('logo_sign_file') is not None or stand.logo_sign_file
            if not has_logo:
                has_logo = any('logo_sign_file' in key for key in list(request.FILES.keys()))
            if not has_logo:
                return Response({
                    "detail": "Logo file is required for our stand"
                }, status=status.HTTP_400_BAD_REQUEST)
        
        instance_data = {
            'stand_details': stand,
            'equipment_selections': equipment_selections
        }
        
        serializer = Stage2Serializer(instance_data, data=data, partial=True)
        if serializer.is_valid():
            result = serializer.save()
            # Create or update feedback with pending status
            create_or_update_feedback(company, 2, 'pending', '')
            
            # Return serialized response
            response_data = {
                'stand_details': StandDetailsSerializer(result['stand_details']).data,
                'equipment_selections': EquipmentSelectionSerializer(result.get('equipment_selections', equipment_selections), many=True, context={'request': request}).data,
            }
            return Response(response_data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class FormStage3View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            # Allow access for company representative or staff/admin
            if company.representative != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_403_FORBIDDEN)
            workshop = Workshop.objects.filter(company=company).first()
            if not workshop:
                return Response({})
            return Response(WorkshopSerializer(workshop).data)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage3View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 3 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            # Check if previous stages have data (not if they're approved)
            if not BasicData.objects.filter(company=company).exists():
                return Response({"detail": "Stage 1 must be completed before accessing stage 3"}, status=status.HTTP_400_BAD_REQUEST)
            if not StandDetails.objects.filter(company=company).exists():
                return Response({"detail": "Stage 2 must be completed before accessing stage 3"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage3View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 3 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        data = request.data.copy()
        data['company'] = company.id
        serializer = WorkshopSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            # Create feedback with pending status
            create_or_update_feedback(company, 3, 'pending', '')
            # Reset completion flag when creating new submission
            form.stage_3_completed = False
            form.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            workshop = Workshop.objects.get(company=company)
            
            # Check feedback status
            latest_feedback = get_latest_feedback(company, 3)
            # If stage was accepted and user is editing, cancel the acceptance by resetting feedback
            if latest_feedback and latest_feedback.status == 'accepted':
                form.stage_3_completed = False
                form.save()
                # Reset feedback status to pending to cancel the acceptance
                create_or_update_feedback(company, 3, 'pending', '')
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Workshop.DoesNotExist:
            return Response({"detail": "Workshop data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage3View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 3 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = WorkshopSerializer(workshop, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # Create or update feedback with pending status
            create_or_update_feedback(company, 3, 'pending', '')
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class FormStage4View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            # Allow access for company representative or staff/admin
            if company.representative != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_403_FORBIDDEN)
            jobwalls = Jobwall.objects.filter(company=company)
            description = Description.objects.filter(company=company).first()
            
            return Response({
                'jobwalls': JobwallSerializer(jobwalls, many=True).data,
                'description': DescriptionSerializer(description).data if description else None,
            })
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage4View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 4 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            # Check if previous stages have data (not if they're approved)
            if not BasicData.objects.filter(company=company).exists():
                return Response({"detail": "Stage 1 must be completed before accessing stage 4"}, status=status.HTTP_400_BAD_REQUEST)
            if not StandDetails.objects.filter(company=company).exists():
                return Response({"detail": "Stage 2 must be completed before accessing stage 4"}, status=status.HTTP_400_BAD_REQUEST)
            if not Workshop.objects.filter(company=company).exists():
                return Response({"detail": "Stage 3 must be completed before accessing stage 4"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage4View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 4 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Parse FormData if needed (similar to Stage2View)
        all_keys = list(request.data.keys()) if hasattr(request.data, 'keys') else []
        
        # Check if we have bracket notation (FormData) or nested dicts (JSON)
        has_bracket_notation = any('[' in str(k) for k in all_keys)
        
        if has_bracket_notation:
            # Parse FormData with bracket notation
            data = {}
            
            # Parse jobwalls
            jobwall_keys = [k for k in all_keys if k.startswith('jobwalls[')]
            if jobwall_keys:
                jobwalls_dict = {}
                for key in jobwall_keys:
                    # Extract index and field name from jobwalls[0][name]
                    parts = key.replace('jobwalls[', '').replace(']', '').split('[')
                    if len(parts) == 2:
                        index = int(parts[0])
                        field = parts[1]
                        if index not in jobwalls_dict:
                            jobwalls_dict[index] = {}
                        value = request.data[key]
                        # Handle QueryDict - get first value if it's a list
                        if isinstance(value, list) and len(value) > 0:
                            value = value[0]
                        jobwalls_dict[index][field] = value
                # Convert dict to list sorted by index
                data['jobwalls'] = [jobwalls_dict[i] for i in sorted(jobwalls_dict.keys())]
            
            # Parse description
            desc_keys = [k for k in all_keys if k.startswith('description[')]
            desc_dict = {}
            if desc_keys:
                for key in desc_keys:
                    # Extract field name from description[descr]
                    field = key.replace('description[', '').replace(']', '')
                    value = request.data[key]
                    # Handle QueryDict - get first value if it's a list
                    if isinstance(value, list) and len(value) > 0:
                        value = value[0]
                    desc_dict[field] = value
            
            # Merge files from request.FILES into description
            for key, file_obj in request.FILES.items():
                if key.startswith('description['):
                    field = key.replace('description[', '').replace(']', '')
                    desc_dict[field] = file_obj
            
            if desc_dict:
                data['description'] = desc_dict
        else:
            # JSON format
            data = request.data.copy()
            # Also merge files from request.FILES if present
            if request.FILES and 'description' in data:
                for key, file_obj in request.FILES.items():
                    if key == 'description[logo_file]' or key == 'logo_file':
                        if 'description' not in data:
                            data['description'] = {}
                        data['description']['logo_file'] = file_obj
        
        # Add company ID to each jobwall
        if 'jobwalls' in data and isinstance(data['jobwalls'], list):
            for jobwall_data in data['jobwalls']:
                jobwall_data['company'] = company.id
        # Add company ID to description if provided
        if 'description' in data and data['description']:
            data['description']['company'] = company.id
        
        serializer = Stage4Serializer(data=data, context={'company': company})
        if serializer.is_valid():
            result = serializer.save()
            # Create feedback with pending status
            create_or_update_feedback(company, 4, 'pending', '')
            # Reset completion flag when creating new submission
            form.stage_4_completed = False
            form.save()
            
            # Return serialized response
            response_data = {
                'jobwalls': JobwallSerializer(result['jobwalls'], many=True).data,
                'description': DescriptionSerializer(result['description']).data if result['description'] else None,
            }
            return Response(response_data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            
            # Check feedback status
            latest_feedback = get_latest_feedback(company, 4)
            # If stage was accepted and user is editing, cancel the acceptance by resetting feedback
            if latest_feedback and latest_feedback.status == 'accepted':
                form.stage_4_completed = False
                form.save()
                # Reset feedback status to pending to cancel the acceptance
                create_or_update_feedback(company, 4, 'pending', '')
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage4View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 4 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Get existing data
        jobwalls = list(Jobwall.objects.filter(company=company))
        description = Description.objects.filter(company=company).first()
        
        instance_data = {
            'jobwalls': jobwalls,
            'description': description
        }
        
        # Parse FormData if needed (similar to POST)
        all_keys = list(request.data.keys()) if hasattr(request.data, 'keys') else []
        
        # Check if we have bracket notation (FormData) or nested dicts (JSON)
        has_bracket_notation = any('[' in str(k) for k in all_keys)
        
        if has_bracket_notation:
            # Parse FormData with bracket notation
            data = {}
            
            # Parse jobwalls
            jobwall_keys = [k for k in all_keys if k.startswith('jobwalls[')]
            if jobwall_keys:
                jobwalls_dict = {}
                for key in jobwall_keys:
                    # Extract index and field name from jobwalls[0][name]
                    parts = key.replace('jobwalls[', '').replace(']', '').split('[')
                    if len(parts) == 2:
                        index = int(parts[0])
                        field = parts[1]
                        if index not in jobwalls_dict:
                            jobwalls_dict[index] = {}
                        value = request.data[key]
                        # Handle QueryDict - get first value if it's a list
                        if isinstance(value, list) and len(value) > 0:
                            value = value[0]
                        jobwalls_dict[index][field] = value
                # Convert dict to list sorted by index
                data['jobwalls'] = [jobwalls_dict[i] for i in sorted(jobwalls_dict.keys())]
            
            # Parse description
            desc_keys = [k for k in all_keys if k.startswith('description[')]
            desc_dict = {}
            if desc_keys:
                for key in desc_keys:
                    # Extract field name from description[descr]
                    field = key.replace('description[', '').replace(']', '')
                    value = request.data[key]
                    # Handle QueryDict - get first value if it's a list
                    if isinstance(value, list) and len(value) > 0:
                        value = value[0]
                    desc_dict[field] = value
            
            # Merge files from request.FILES into description
            for key, file_obj in request.FILES.items():
                if key.startswith('description['):
                    field = key.replace('description[', '').replace(']', '')
                    desc_dict[field] = file_obj
            
            if desc_dict:
                data['description'] = desc_dict
        else:
            # JSON format
            data = request.data.copy()
            # Also merge files from request.FILES if present
            if request.FILES and 'description' in data:
                for key, file_obj in request.FILES.items():
                    if key == 'description[logo_file]' or key == 'logo_file':
                        if 'description' not in data:
                            data['description'] = {}
                        data['description']['logo_file'] = file_obj
        
        # Add company ID to each jobwall if provided
        if 'jobwalls' in data and isinstance(data['jobwalls'], list):
            for jobwall_data in data['jobwalls']:
                if isinstance(jobwall_data, dict):
                    jobwall_data['company'] = company.id
        # Add company ID to description if provided
        if 'description' in data and data['description'] and isinstance(data['description'], dict):
            data['description']['company'] = company.id
        
        serializer = Stage4Serializer(instance_data, data=data, partial=True, context={'company': company})
        if serializer.is_valid():
            result = serializer.save()
            # Create or update feedback with pending status
            create_or_update_feedback(company, 4, 'pending', '')
            
            # Return serialized response
            response_data = {
                'jobwalls': JobwallSerializer(result.get('jobwalls', jobwalls), many=True).data,
                'description': DescriptionSerializer(result.get('description')).data if result.get('description') else None,
            }
            return Response(response_data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FormStage5View(APIView):
    permission_classes = [IsAuthenticated]

    def get_objects(self, company):
        """
        Pobiera obiekty dla Stage 5
        """
        final_data = FinalData.objects.filter(company=company).first()
        
        # Get PDI if it exists (Exhibitor is related to PDI, not Form)
        pdi = None
        if final_data:
            try:
                pdi = final_data.pdis
            except PDI.DoesNotExist:
                pdi = None

        return {
            'final_data': final_data,
            'lunches': Lunch.objects.filter(form=final_data) if final_data else [],
            'exhibitors': Exhibitor.objects.filter(form=pdi) if pdi else []
        }

    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            # Allow access for company representative or staff/admin
            if company.representative != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_403_FORBIDDEN)
            form = Form.objects.get(company=company)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage5View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 5 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        objects = self.get_objects(company)
        if not objects['final_data']:
            return Response({
                'final_data': None,
                'lunches': [],
                'pdi': None,
                'pdi_attendees': [],
                'exhibitors': [],
            })

        # Safely get PDI - OneToOne reverse relation raises DoesNotExist if not present
        try:
            pdi = objects['final_data'].pdis
        except PDI.DoesNotExist:
            pdi = None
        
        pdi_attendees = pdi.pdiattendees.all() if pdi else []

        data = {
            'final_data': FinalDataSerializer(objects['final_data']).data,
            'lunches': LunchSerializer(objects['lunches'], many=True).data,
            'pdi': PDISerializer(pdi).data if pdi else None,
            'pdi_attendees': PDIAttendeeSerializer(pdi_attendees, many=True).data,
            'exhibitors': ExhibitorSerializer(objects['exhibitors'], many=True).data,
        }
        return Response(data)

    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            # Check if previous stages have data (not if they're approved)
            if not BasicData.objects.filter(company=company).exists():
                return Response({"detail": "Stage 1 must be completed before accessing stage 5"}, status=status.HTTP_400_BAD_REQUEST)
            if not StandDetails.objects.filter(company=company).exists():
                return Response({"detail": "Stage 2 must be completed before accessing stage 5"}, status=status.HTTP_400_BAD_REQUEST)
            if not Workshop.objects.filter(company=company).exists():
                return Response({"detail": "Stage 3 must be completed before accessing stage 5"}, status=status.HTTP_400_BAD_REQUEST)
            # Stage 4 can have either Jobwalls or Description (or both)
            if not Jobwall.objects.filter(company=company).exists() and not Description.objects.filter(company=company).exists():
                return Response({"detail": "Stage 4 must be completed before accessing stage 5"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage5View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 5 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        data = request.data.copy()
        if 'final_data' in data:
            data['final_data']['company'] = company.id

        serializer = Stage5Serializer(data=data, context={'company': company})
        if serializer.is_valid():
            serializer.save()
            # Create feedback with pending status
            create_or_update_feedback(company, 5, 'pending', '')
            # Reset completion flag when creating new submission
            form.stage_5_completed = False
            form.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            
            # Check feedback status
            latest_feedback = get_latest_feedback(company, 5)
            # If stage was accepted and user is editing, cancel the acceptance by resetting feedback
            if latest_feedback and latest_feedback.status == 'accepted':
                form.stage_5_completed = False
                form.save()
                # Reset feedback status to pending to cancel the acceptance
                create_or_update_feedback(company, 5, 'pending', '')
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage5View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 5 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        objects = self.get_objects(company)
        if not objects['final_data']:
            return Response({"detail": "Use POST to create data first"}, status=status.HTTP_404_NOT_FOUND)

        # Safely get PDI - OneToOne reverse relation raises DoesNotExist if not present
        try:
            pdi = objects['final_data'].pdis
        except PDI.DoesNotExist:
            pdi = None
        
        pdi_attendees = list(pdi.pdiattendees.all()) if pdi else []

        instance_data = {
            'final_data': objects['final_data'],
            'lunches': list(objects['lunches']),
            'pdi': pdi,
            'pdi_attendees': pdi_attendees,
            'exhibitors': list(objects['exhibitors'])
        }

        # Remove company field from request data for PATCH (it's a OneToOneField and shouldn't change)
        data = request.data.copy()
        if 'final_data' in data and 'company' in data['final_data']:
            del data['final_data']['company']

        serializer = Stage5Serializer(instance_data, data=data, partial=True, context={'company': company})
        if serializer.is_valid():
            serializer.save()
            # Create or update feedback with pending status
            create_or_update_feedback(company, 5, 'pending', '')
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# akcpetacja FR + feedback
class FormReviewView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, company_id, stage_num):
        try:
            validate_company_id(company_id)
            validate_stage_num(stage_num)
            company = Company.objects.get(id=company_id)
            if company.fr_resp != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "You don't have permission to review this company's forms"}, status=status.HTTP_403_FORBIDDEN)
            form = Form.objects.get(company=company)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormReviewView.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while processing the review"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        feedback_status = request.data.get('status', 'pending')
        feedback_comment = request.data.get('comment', '')
        
        # Validate feedback status
        if feedback_status not in ['pending', 'accepted', 'rejected']:
            return Response({"detail": "Invalid feedback status"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Create or update feedback
        feedback = create_or_update_feedback(company, stage_num, feedback_status, feedback_comment)
        
        # Update form completion status
        setattr(form, f'stage_{stage_num}_completed', (feedback_status == 'accepted'))
        form.save()
        
        # Send email notification if status is accepted or rejected
        if feedback_status in ['accepted', 'rejected'] and company.representative:
            try:
                self._send_stage_feedback_email(company, stage_num, feedback_status, feedback_comment)
            except Exception as e:
                # Log the error but don't fail the request
                logger.error(f"Error sending stage feedback email: {e}", exc_info=True)
        
        serializer = FeedbackSerializer(feedback)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def _send_stage_feedback_email(self, company, stage_num, status, comment):
        """Send email notification when stage is accepted or rejected"""
        # Get company representative
        representative = company.representative
        if not representative or not representative.email:
            logger.warning(f"No representative email found for company {company.id}")
            return
        
        # Get language preference (default to Polish)
        language = getattr(representative, 'language', 'pl') or 'pl'
        if language not in ['en', 'pl']:
            language = 'pl'
        
        # Stage name mapping
        stage_names = {
            1: {'en': 'Stage 1: Basic Data', 'pl': 'Etap 1: Dane podstawowe'},
            2: {'en': 'Stage 2: Equipment', 'pl': 'Etap 2: Wyposażenie'},
            3: {'en': 'Stage 3: Workshops', 'pl': 'Etap 3: Warsztaty'},
            4: {'en': 'Stage 4: Jobwall', 'pl': 'Etap 4: Jobwall'},
            5: {'en': 'Stage 5: Final Data', 'pl': 'Etap 5: Dane końcowe'},
        }
        stage_name = stage_names.get(stage_num, {}).get(language, f'Stage {stage_num}')
        
        # Dashboard link
        dashboard_link = f"{settings.FRONTEND_BASE_URL}/panel/exhibitor"
        
        # Use backend URL for static files (logo is hosted on backend)
        backend_url = os.environ.get('BACKEND_BASE_URL', 'http://localhost:8000')
        logo_url = f"{backend_url}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"
        
        # Select template based on status and language
        if status == 'accepted':
            template_name = f"emails/stage_accepted_{language}.html"
            if language == 'en':
                subject = f"Stage {stage_num} Accepted - ITP System"
            else:
                subject = f"Etap {stage_num} zaakceptowany - ITP System"
        else:  # rejected
            template_name = f"emails/stage_rejected_{language}.html"
            if language == 'en':
                subject = f"Stage {stage_num} Requires Corrections - ITP System"
            else:
                subject = f"Etap {stage_num} wymaga poprawek - ITP System"
        
        # Get staff contact email (fr_resp) or default
        staff_email = None
        if company.fr_resp and company.fr_resp.email:
            staff_email = company.fr_resp.email
        default_email = 'best@best.pw.edu.pl'
        
        # Build contact text for plain messages
        if staff_email:
            contact_text_en = f' your staff contact at {staff_email} or us at {default_email}'
            contact_text_pl = f' ze swoim opiekunem pod adresem {staff_email} lub z nami pod adresem {default_email}'
        else:
            contact_text_en = f' us at {default_email}'
            contact_text_pl = f' z nami pod adresem {default_email}'
        
        # Plain text message
        if status == 'accepted':
            if language == 'en':
                plain_message = f"""Hello {representative.username or representative.email},

Your submission for {stage_name} for {company.name} has been accepted by our staff.

{f'Staff Comment: {comment}' if comment else ''}

You can continue with the next stage of your application or check your progress in the platform: {dashboard_link}

If you have any questions, please contact{contact_text_en}."""
            else:
                plain_message = f"""Cześć {representative.username or representative.email},

Twoje zgłoszenie dla {stage_name} dla {company.name} zostało zaakceptowane przez nasz zespół.

{f'Komentarz zespołu: {comment}' if comment else ''}

Możesz kontynuować z następnym etapem swojego zgłoszenia lub sprawdzić postęp w platformie: {dashboard_link}

Jeśli masz pytania, skontaktuj się{contact_text_pl}."""
        else:  # rejected
            if language == 'en':
                plain_message = f"""Hello {representative.username or representative.email},

Your submission for {stage_name} for {company.name} requires corrections before it can be accepted.

{f'Staff Feedback: {comment}' if comment else 'Please review your submission and make the necessary corrections.'}

Please review the feedback above and make the necessary corrections. Once you've updated your submission, you can resubmit it for review: {dashboard_link}

If you have any questions, please contact{contact_text_en}."""
            else:
                plain_message = f"""Cześć {representative.username or representative.email},

Twoje zgłoszenie dla {stage_name} dla {company.name} wymaga poprawek przed akceptacją.

{f'Uwagi zespołu: {comment}' if comment else 'Prosimy o przejrzenie zgłoszenia i wprowadzenie niezbędnych poprawek.'}

Prosimy o przejrzenie uwag powyżej i wprowadzenie niezbędnych poprawek. Po zaktualizowaniu zgłoszenia możesz ponownie je przesłać do weryfikacji: {dashboard_link}

Jeśli masz pytania, skontaktuj się{contact_text_pl}."""
        
        # Render HTML template
        html_content = render_to_string(template_name, {
            'company_name': company.name,
            'stage_name': stage_name,
            'comment': comment,
            'dashboard_link': dashboard_link,
            'logo_url': logo_url,
            'staff_email': staff_email,
            'default_email': default_email,
        })
        
        # Send email with HTML and plain text alternatives
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[representative.email],
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send(fail_silently=False)

# wszystkie feedbacki
class CompanyFeedbackListView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            if company.representative != request.user and company.fr_resp != request.user:
                return Response({"detail": "You don't have permission to view feedbacks for this company"}, status=status.HTTP_403_FORBIDDEN)
            feedbacks = Feedback.objects.filter(company=company).order_by('-id')
            return Response(FeedbackSerializer(feedbacks, many=True).data)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyFeedbackListView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving feedbacks"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class FormStatusView(APIView):
    """
    Get form status for a company - returns completion flags and latest feedback per stage.
    Used by exhibitor panel to display stage overview.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            # Allow access for company representative, FR responsible, or staff/admin
            if company.representative != request.user and company.fr_resp != request.user and request.user.type not in ['admin', 'staff']:
                return Response({"detail": "You don't have permission to view this company's form status"}, status=status.HTTP_403_FORBIDDEN)
            
            # Get or create the Form object
            form, _ = Form.objects.get_or_create(company=company)
            
            # Get all feedbacks for this company, grouped by stage
            feedbacks = Feedback.objects.filter(company=company).order_by('-id')
            
            # Get latest feedback per stage
            stage_feedbacks = {}
            for i in range(1, 6):
                stage_key = f'stage_{i}'
                stage_feedback = feedbacks.filter(form=stage_key).first()
                if stage_feedback:
                    stage_feedbacks[stage_key] = {
                        'status': stage_feedback.status,
                        'comment': stage_feedback.comment,
                    }
            
            # Check if stage data exists
            stage_data_exists = {
                'stage_1': BasicData.objects.filter(company=company).exists(),
                'stage_2': StandDetails.objects.filter(company=company).exists(),
                'stage_3': Workshop.objects.filter(company=company).exists(),
                'stage_4': Jobwall.objects.filter(company=company).exists() or Description.objects.filter(company=company).exists(),
                'stage_5': FinalData.objects.filter(company=company).exists(),
            }
            
            return Response({
                'form': {
                    'id': form.id,
                    'current_stage': form.current_stage,
                    'stage_1_completed': form.stage_1_completed,
                    'stage_2_completed': form.stage_2_completed,
                    'stage_3_completed': form.stage_3_completed,
                    'stage_4_completed': form.stage_4_completed,
                    'stage_5_completed': form.stage_5_completed,
                },
                'feedbacks': stage_feedbacks,
                'data_exists': stage_data_exists,
            })
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStatusView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving form status"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class JobwallPriceView(APIView):
    """
    Get the current jobwall price from system settings.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            settings = Settings.get_settings()
            return Response({
                'jobwall_price': str(settings.jobwall_price),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in JobwallPriceView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving jobwall price"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StageDeadlinesView(APIView):
    """
    Get the global deadlines for all form stages from system settings.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            settings = Settings.get_settings()
            # Convert datetime fields to ISO format strings, or None if not set
            return Response({
                'stage_1_deadline': settings.stage_1_deadline.isoformat() if settings.stage_1_deadline else None,
                'stage_2_deadline': settings.stage_2_deadline.isoformat() if settings.stage_2_deadline else None,
                'stage_3_deadline': settings.stage_3_deadline.isoformat() if settings.stage_3_deadline else None,
                'stage_4_deadline': settings.stage_4_deadline.isoformat() if settings.stage_4_deadline else None,
                'stage_5_deadline': settings.stage_5_deadline.isoformat() if settings.stage_5_deadline else None,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in StageDeadlinesView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage deadlines"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderSummaryPDFView(APIView):
    """
    Generate and download order summary PDF for a company.
    Only available when all stages are completed and accepted by staff.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            
            # Check authorization - only company representative can access
            if company.representative != request.user and request.user.type not in ['admin', 'staff']:
                return Response(
                    {"detail": "You don't have permission to access this order summary"},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Get form to check completion status
            try:
                form = Form.objects.get(company=company)
            except Form.DoesNotExist:
                return Response(
                    {"detail": "Form not found for this company"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Check that all stages are completed
            all_stages_completed = all([
                form.stage_1_completed,
                form.stage_2_completed,
                form.stage_3_completed,
                form.stage_4_completed,
                form.stage_5_completed,
            ])
            
            if not all_stages_completed:
                return Response(
                    {"detail": "Not all stages are completed. Please complete all stages before downloading the order summary."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check that all stages have accepted feedback
            for stage_num in range(1, 6):
                stage_feedback = get_latest_feedback(company, stage_num)
                if not stage_feedback or stage_feedback.status != 'accepted':
                    return Response(
                        {"detail": f"Stage {stage_num} has not been accepted by staff yet. All stages must be accepted before downloading the order summary."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Check that at least one stand is assigned
            stands = Stand.objects.filter(company=company)
            if not stands.exists():
                return Response(
                    {"detail": "No stands have been assigned by staff yet. Please wait for stand assignments before downloading the order summary."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get user language preference
            user_language = getattr(request.user, 'language', 'pl') or 'pl'
            if user_language not in ['en', 'pl']:
                user_language = 'pl'
            
            # Generate PDF
            try:
                from .pdf_generator import OrderSummaryPDFGenerator
                generator = OrderSummaryPDFGenerator(company, language=user_language)
                pdf_buffer = generator.generate()
                
                # Prepare response
                from django.http import HttpResponse
                response = HttpResponse(pdf_buffer, content_type='application/pdf')
                filename = f"order_summary_{company.name.replace(' ', '_')}.pdf"
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                
                return response
                
            except Exception as e:
                logger.error(f"Error generating PDF for company {company_id}: {e}", exc_info=True)
                return Response(
                    {"detail": "An error occurred while generating the PDF"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
                
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in OrderSummaryPDFView.get: {e}", exc_info=True)
            return Response(
                {"detail": "An error occurred while processing the request"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SendStageReminderView(APIView):
    """
    Send reminder emails to all companies that haven't completed a specific form stage.
    Only accessible by admin users.
    """
    permission_classes = [IsAuthenticated, IsAdmin]
    
    def post(self, request):
        try:
            stage = request.data.get('stage')
            if not stage:
                return Response({"detail": "Stage parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                stage_num = int(stage)
                if stage_num not in [1, 2, 3, 4, 5]:
                    return Response({"detail": "Stage must be between 1 and 5"}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError):
                return Response({"detail": "Stage must be a valid integer"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get all companies
            all_companies = Company.objects.all()
            
            # Filter to only companies that haven't filled in the stage (no data exists)
            # This excludes companies that submitted but weren't accepted
            companies_to_notify = []
            for company in all_companies:
                # Skip if no representative or email
                if not company.representative or not company.representative.email:
                    continue
                
                # Check if stage data exists
                stage_data_exists = False
                if stage_num == 1:
                    stage_data_exists = BasicData.objects.filter(company=company).exists()
                elif stage_num == 2:
                    stage_data_exists = StandDetails.objects.filter(company=company).exists()
                elif stage_num == 3:
                    stage_data_exists = Workshop.objects.filter(company=company).exists()
                elif stage_num == 4:
                    stage_data_exists = (
                        Jobwall.objects.filter(company=company).exists() or 
                        Description.objects.filter(company=company).exists()
                    )
                elif stage_num == 5:
                    stage_data_exists = FinalData.objects.filter(company=company).exists()
                
                # Only send reminder if stage data does NOT exist
                if not stage_data_exists:
                    companies_to_notify.append(company)
            
            if not companies_to_notify:
                return Response({
                    "message": "No companies found that need reminders for this stage",
                    "emails_sent": 0
                }, status=status.HTTP_200_OK)
            
            # Send reminder emails
            emails_sent = 0
            emails_failed = 0
            
            for company in companies_to_notify:
                try:
                    self._send_stage_reminder_email(company, stage_num)
                    emails_sent += 1
                    logger.info(f"Stage {stage_num} reminder email sent to {company.representative.email} for company {company.id}")
                except Exception as e:
                    emails_failed += 1
                    logger.error(f"Error sending stage {stage_num} reminder email to {company.representative.email} for company {company.id}: {e}", exc_info=True)
            
            return Response({
                "message": f"Reminder emails sent for stage {stage_num}",
                "emails_sent": emails_sent,
                "emails_failed": emails_failed,
                "total_companies": len(companies_to_notify)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error in SendStageReminderView.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while sending reminder emails"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _send_stage_reminder_email(self, company, stage_num):
        """Send reminder email for a specific stage"""
        representative = company.representative
        if not representative or not representative.email:
            logger.warning(f"No representative email found for company {company.id}")
            return
        
        # Get language preference (default to Polish)
        language = getattr(representative, 'language', 'pl') or 'pl'
        if language not in ['en', 'pl']:
            language = 'pl'
        
        # Stage name mapping
        stage_names = {
            1: {'en': 'Stage 1: Basic Data', 'pl': 'Etap 1: Dane podstawowe'},
            2: {'en': 'Stage 2: Equipment', 'pl': 'Etap 2: Wyposażenie'},
            3: {'en': 'Stage 3: Workshops', 'pl': 'Etap 3: Warsztaty'},
            4: {'en': 'Stage 4: Jobwall', 'pl': 'Etap 4: Jobwall'},
            5: {'en': 'Stage 5: Final Data', 'pl': 'Etap 5: Dane końcowe'},
        }
        stage_name = stage_names.get(stage_num, {}).get(language, f'Stage {stage_num}')
        
        # Dashboard link
        dashboard_link = f"{settings.FRONTEND_BASE_URL}/panel/exhibitor"
        
        # Use backend URL for static files (logo is hosted on backend)
        backend_url = os.environ.get('BACKEND_BASE_URL', 'http://localhost:8000')
        logo_url = f"{backend_url}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"
        
        # Select template based on language
        template_name = f"emails/stage_reminder_{language}.html"
        
        # Subject based on language
        if language == 'en':
            subject = f"Reminder: Complete Stage {stage_num} - ITP System"
        else:
            subject = f"Przypomnienie: Uzupełnij etap {stage_num} - ITP System"
        
        # Get staff contact email (fr_resp) or default
        staff_email = None
        if company.fr_resp and company.fr_resp.email:
            staff_email = company.fr_resp.email
        default_email = 'best@best.pw.edu.pl'
        
        # Plain text message
        if language == 'en':
            plain_message = f"""Hello {representative.username or representative.email},

This is a friendly reminder that {stage_name} for {company.name} has not yet been completed.

Please complete this stage of your application as soon as possible to ensure your participation in the Engineering Job Fair.

You can access your dashboard here: {dashboard_link}

If you have any questions, please contact{' your staff contact at ' + staff_email + ' or' if staff_email else ''} us at {default_email}."""
        else:
            plain_message = f"""Witaj {representative.username or representative.email},

To przyjazne przypomnienie, że {stage_name} dla {company.name} nie zostało jeszcze uzupełnione.

Prosimy o uzupełnienie tego etapu zgłoszenia jak najszybciej, aby zapewnić udział w Inżynierskich Targach Pracy.

Możesz uzyskać dostęp do panelu tutaj: {dashboard_link}

Jeśli masz pytania, skontaktuj się{' ze swoim opiekunem pod adresem ' + staff_email + ' lub' if staff_email else ''} z nami pod adresem {default_email}."""
        
        # Render HTML template
        try:
            html_content = render_to_string(template_name, {
                'company_name': company.name,
                'stage_name': stage_name,
                'dashboard_link': dashboard_link,
                'logo_url': logo_url,
                'staff_email': staff_email,
                'default_email': default_email,
            })
            logger.info(f"Email template '{template_name}' rendered successfully")
        except Exception as e:
            logger.error(f"Error rendering email template '{template_name}': {e}", exc_info=True)
            raise
        
        # Send email with HTML and plain text alternatives
        try:
            email_message = EmailMultiAlternatives(
                subject=subject,
                body=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[representative.email],
            )
            email_message.attach_alternative(html_content, "text/html")
            email_message.send(fail_silently=False)
            logger.info(f"Reminder email sent successfully to {representative.email}")
        except Exception as e:
            logger.error(f"Error sending email to {representative.email}: {e}", exc_info=True)
            raise

class ExportCSVView(APIView):
    """
    Export company data to CSV format.
    
    Accessible only to admin users via Django session authentication.
    Generates a streaming CSV response with all company form data.
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAdminOrStaff]

    def get(self, request):
        from django.http import StreamingHttpResponse
        from companies.services.export_service import ExportService
        from datetime import datetime

        export_service = ExportService(user=request.user, filters={})
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'companies_export_{timestamp}.csv'

        response = StreamingHttpResponse(
            export_service.generate_csv(),
            content_type='text/csv; charset=utf-8-sig'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        logger.info(f"CSV export initiated by user {request.user.username}")
        return response


class ExportLogosView(APIView):
    """
    Export all company logos as a ZIP file.
    
    Accessible only to admin users via Django session authentication.
    Creates a ZIP archive containing all logo files from stand_details.
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAdminOrStaff]

    def get(self, request):
        from django.http import HttpResponse
        from datetime import datetime
        import zipfile
        from io import BytesIO

        companies = Company.objects.filter(
            stand_details__logo_sign_file__isnull=False
        ).select_related('stand_details')

        buffer = BytesIO()
        
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for company in companies:
                if company.stand_details.logo_sign_file:
                    try:
                        file_path = company.stand_details.logo_sign_file.path
                        file_name = f"{company.name}_{os.path.basename(file_path)}"
                        zip_file.write(file_path, arcname=file_name)
                    except Exception as e:
                        logger.warning(f"Could not add logo for company {company.name}: {e}")
                        continue

        buffer.seek(0)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'company_logos_{timestamp}.zip'
        
        response = HttpResponse(buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        logger.info(f"Logos ZIP export initiated by user {request.user.username}")
        return response

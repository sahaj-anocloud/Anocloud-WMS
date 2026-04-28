ALTER TABLE vendors 
ADD COLUMN first_approver_id UUID REFERENCES user_profiles(user_id),
ADD COLUMN first_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN second_approver_id UUID REFERENCES user_profiles(user_id),
ADD COLUMN second_approved_at TIMESTAMP WITH TIME ZONE;
